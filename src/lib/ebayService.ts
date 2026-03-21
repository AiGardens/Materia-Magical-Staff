/**
 * Materia Magical Staff — eBay Service Module
 *
 * CONTRACT: This is the ONLY file in the codebase that communicates with eBay's APIs.
 * All endpoints, schemas, and error shapes strictly follow EBAY_API_GUIDELINES.md.
 * Do not call eBay APIs from any other module.
 *
 * Implemented in Phase 2:
 *   - getAccessToken()         — OAuth refresh_token flow with in-memory cache (§1)
 *   - getFulfillmentPolicies() — Shipping policies (§5)
 *   - getReturnPolicies()      — Return policies (§6)
 *   - getPaymentPolicies()     — Payment policies (§7)
 *
 * Implemented in Phase 4:
 *   - getCategorySuggestions()     — Taxonomy: best leaf category (§2)
 *   - getItemAspectsForCategory()  — Taxonomy: full aspect schema (§3)
 *
 * Implemented in Phase 6:
 *   - createInventoryLocation()            — First-run setup (§4)
 *   - bulkCreateOrReplaceInventoryItem()   — Batch inventory creation (§8)
 *   - bulkCreateOffer()                    — Batch offer creation draft-only (§9)
 *   - createOffer()                        — Single offer fallback (§10)
 *
 * Best Offer helpers (Phase 6 update):
 *   - validateBestOfferSettings()  — Pre-flight validation, halts on violations
 *   - buildBestOfferTerms()        — Conditionally constructs bestOfferTerms payload
 *
 * Session 23 fix:
 *   - ebayFetch<T>()               — Safe response parser with auto-retry (Fix #1)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured eBay API error — surfaces the full error object to the frontend.
 * Shape matches both singular and bulk endpoint error formats from EBAY_API_GUIDELINES.md.
 */
export class EbayApiError extends Error {
    public readonly errorId?: number;
    public readonly domain?: string;
    public readonly category?: string;
    public readonly longMessage?: string;
    public readonly parameters?: Array<{ name: string; value: string }>;
    public readonly statusCode?: number;

    constructor(
        message: string,
        options?: {
            errorId?: number;
            domain?: string;
            category?: string;
            longMessage?: string;
            parameters?: Array<{ name: string; value: string }>;
            statusCode?: number;
        }
    ) {
        super(message);
        this.name = "EbayApiError";
        this.errorId = options?.errorId;
        this.domain = options?.domain;
        this.category = options?.category;
        this.longMessage = options?.longMessage;
        this.parameters = options?.parameters;
        this.statusCode = options?.statusCode;
    }
}

// Policy response shapes (relevant fields per EBAY_API_GUIDELINES.md)
export interface FulfillmentPolicy {
    fulfillmentPolicyId: string;
    name: string;
    description?: string;
}

export interface ReturnPolicy {
    returnPolicyId: string;
    name: string;
    returnsAccepted: boolean;
}

export interface PaymentPolicy {
    paymentPolicyId: string;
    name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 Input / Output Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input shape for a single inventory item in bulkCreateOrReplaceInventoryItem
 * Maps to one entry in the `requests` array per EBAY_API_GUIDELINES.md §8.
 */
export interface InventoryItemInput {
    sku: string;
    title: string;
    description: string;
    aspects: Record<string, string[]>;
    imageUrls: string[];
    condition: string;
    conditionDescription?: string;
    quantity: number;
    /**
     * Verified catalog identifiers (Session 25).
     * When present, included in product.isbn/upc/ean/mpn/brand so eBay can
     * match this item to its product catalog and avoid error 25604 "Product not found"
     * at publishOffer time for catalog-required categories.
     */
    productIdentifiers?: {
        isbn?: string[];
        upc?: string[];
        ean?: string[];
        mpn?: string;
        brand?: string;
    } | null;
}

/**
 * Per-item result from a bulk eBay operation.
 * statusCode >= 400 means failure; the errors array will be populated.
 */
export interface BulkItemResult {
    sku: string;
    statusCode: number;
    errors?: EbayErrorObject[];
    warnings?: EbayErrorObject[];
}

/**
 * Per-item result from bulkCreateOffer — includes offerId on success.
 */
export interface BulkOfferResult extends BulkItemResult {
    offerId?: string;
}

/**
 * Shape of an individual eBay error object for use in bulk responses.
 */
export interface EbayErrorObject {
    errorId?: number;
    domain?: string;
    category?: string;
    message?: string;
    longMessage?: string;
    parameters?: Array<{ name: string; value: string }>;
}

/**
 * Input shape for a single offer in bulkCreateOffer / createOffer.
 * Maps to one entry in the `requests` array per EBAY_API_GUIDELINES.md §9.
 */
export interface OfferInput {
    sku: string;
    categoryId: string;
    priceValue: string;      // stringified decimal, e.g. "49.99"
    currency: string;        // e.g. "CAD"
    quantity: number;
    fulfillmentPolicyId: string;
    returnPolicyId: string;
    paymentPolicyId: string;
    merchantLocationKey: string;
    marketplaceId: string;
    /**
     * Optional ISO-8601 UTC timestamp for scheduled listings.
     * Per EBAY_API_GUIDELINES.md §9: if provided, the published offer will go
     * live at this time instead of immediately.
     * Example: "2026-03-30T20:34:00.000Z"
     */
    listingStartDate?: string;
    /**
     * Pre-built bestOfferTerms object or null.
     * Built by buildBestOfferTerms() — never include autoDeclinePrice.
     * Per EBAY_API_GUIDELINES.md §11: only included when listing.acceptOffers is true
     * AND listing.bestOfferEligible is true AND autoAcceptPriceCAD is valid.
     */
    bestOfferTerms?: {
        bestOfferEnabled: true;
        autoAcceptPrice: {
            value: string;
            currency: string;
        };
    } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Token Cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory token cache. Node.js process-level — shared across all concurrent
 * requests. Refreshed automatically when within 60s of expiry.
 */
let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0; // Unix timestamp in milliseconds

/**
 * getAccessToken — OAuth refresh_token flow per EBAY_API_GUIDELINES.md §1
 *
 * Endpoint: POST https://api.ebay.com/identity/v1/oauth2/token
 * Caches the token in-memory. Auto-refreshes when within 60s of expiry.
 * Tokens are valid for 7200s (2 hours) per eBay's standard.
 */
export async function getAccessToken(): Promise<string> {
    const now = Date.now();
    const sixtySecondsMs = 60 * 1000;

    // Return cached token if still valid (with 60s safety buffer)
    if (_cachedToken && _tokenExpiresAt > now + sixtySecondsMs) {
        return _cachedToken;
    }

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const refreshToken = process.env.EBAY_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new EbayApiError(
            "eBay credentials are not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REFRESH_TOKEN in your .env file.",
            { category: "CONFIGURATION" }
        );
    }

    // Base64 encode credentials per EBAY_API_GUIDELINES.md §1
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const data = await ebayFetch<{ access_token: string; expires_in: number }>(
        () => fetch("https://api.ebay.com/identity/v1/oauth2/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${credentials}`,
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }).toString(),
        }),
        "getAccessToken"
    );

    // Cache the token. eBay returns expires_in in seconds.
    _cachedToken = data.access_token;
    _tokenExpiresAt = now + (data.expires_in ?? 7200) * 1000;

    return _cachedToken!;
}
// ─────────────────────────────────────────────────────────────────────────────
// Best Offer Helpers — Phase 6 Update
// Per EBAY_API_GUIDELINES.md §11
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateBestOfferSettings
 *
 * Pre-flight validation run BEFORE any eBay API call is made.
 * Scans every listing in the batch and collects ALL violations.
 * Does NOT stop at the first violation — returns the full array.
 *
 * If the returned array is non-empty, the caller MUST halt the entire batch,
 * surface the violations to the user, and refuse to proceed until they are fixed.
 *
 * Violations checked:
 *   1. acceptOffers=true AND autoAcceptPriceCAD is set AND >= finalPriceCAD
 *   2. acceptOffers=true AND autoAcceptPriceCAD is set AND <= 0
 */
export function validateBestOfferSettings(listings: import("@/types").ListingObject[]): string[] {
    const violations: string[] = [];

    for (const listing of listings) {
        if (
            listing.acceptOffers === true &&
            listing.autoAcceptPriceCAD !== null &&
            listing.autoAcceptPriceCAD !== undefined &&
            listing.autoAcceptPriceCAD >= listing.finalPriceCAD
        ) {
            violations.push(
                `${listing.title}: Auto-accept price must be lower than the listing price.`
            );
        }

        if (
            listing.acceptOffers === true &&
            listing.autoAcceptPriceCAD !== null &&
            listing.autoAcceptPriceCAD !== undefined &&
            listing.autoAcceptPriceCAD <= 0
        ) {
            violations.push(
                `${listing.title}: Auto-accept price must be greater than zero.`
            );
        }
    }

    return violations;
}

/**
 * buildBestOfferTerms
 *
 * Takes a single ListingObject and returns the bestOfferTerms payload object,
 * or null if Best Offers should be omitted for this listing.
 *
 * Per EBAY_API_GUIDELINES.md §11:
 *   - autoDeclinePrice is PERMANENTLY EXCLUDED. Never add it.
 *   - Only included when bestOfferEligible=true AND acceptOffers=true
 *     AND autoAcceptPriceCAD is a valid positive number < finalPriceCAD.
 *
 * @returns bestOfferTerms object to spread into listingPolicies, or null to omit
 */
export function buildBestOfferTerms(
    listing: import("@/types").ListingObject
): { bestOfferEnabled: true; autoAcceptPrice: { value: string; currency: string } } | null {
    // Gate 1: category must support Best Offer
    if (listing.bestOfferEligible === false) return null;
    // Gate 2: user must have enabled Accept Offers on this listing
    if (listing.acceptOffers === false) return null;
    // Gate 3: a valid auto-accept price must be set
    if (listing.autoAcceptPriceCAD === null || listing.autoAcceptPriceCAD === undefined) return null;
    if (listing.autoAcceptPriceCAD <= 0) return null;
    // Gate 4: price relationship guard (must be < Buy It Now price)
    // The validateBestOfferSettings pre-flight enforces >= check, but we guard here too
    if (listing.autoAcceptPriceCAD >= listing.finalPriceCAD) return null;

    return {
        bestOfferEnabled: true,
        autoAcceptPrice: {
            value: listing.autoAcceptPriceCAD.toFixed(2),
            currency: "CAD",
        },
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse eBay error response body into an EbayApiError.
 * Works for both singular endpoints (errors array) and policy endpoints.
 *
 * Session 29 improvement: logs raw response body when standard errors[0] extraction
 * fails, so non-standard eBay error shapes (e.g. bulk endpoint 400s with
 * responses[] instead of errors[]) are visible in the terminal for diagnosis.
 *
 * Session 30 improvement: also checks bulk endpoint shape
 * { responses: [{ errors: [...] }] } so errorId/domain/category are visible
 * for bulkCreateOrReplaceInventoryItem failures instead of showing undefined.
 */
async function parseEbayError(response: Response, context: string): Promise<EbayApiError> {
    let rawText = "";
    try {
        rawText = await response.text();
        const body = JSON.parse(rawText);

        // Standard eBay error shape: { errors: [{ errorId, message, ... }] }
        // Bulk endpoint shape:       { responses: [{ errors: [...] }] }
        const firstError =
            body?.errors?.[0] ??
            body?.responses?.[0]?.errors?.[0];

        // If neither shape yielded anything, log the raw body for diagnosis
        if (!firstError) {
            console.error(
                `[parseEbayError] ${context} — HTTP ${response.status} — no errors[0] found. Raw body:\n`,
                rawText.slice(0, 1000)
            );
        }

        return new EbayApiError(firstError?.message ?? `${context} failed (HTTP ${response.status})`, {
            errorId: firstError?.errorId,
            domain: firstError?.domain,
            category: firstError?.category,
            longMessage: firstError?.longMessage,
            parameters: firstError?.parameters,
            statusCode: response.status,
        });
    } catch {
        // JSON parse failed — log whatever raw text we got
        if (rawText) {
            console.error(
                `[parseEbayError] ${context} — HTTP ${response.status} — non-JSON body:\n`,
                rawText.slice(0, 500)
            );
        }
        return new EbayApiError(`${context} failed with status ${response.status}`, {
            statusCode: response.status,
        });
    }
}

/**
 * ebayFetch<T> — Safe eBay API response parser with auto-retry (Fix #1, Session 23)
 *
 * Every eBay API call previously called response.json() directly on the success
 * path with zero protection. A 200 OK with an empty or malformed body would throw
 * SyntaxError: Unexpected end of JSON input, crashing the item with no recovery.
 *
 * This function wraps any eBay API call and:
 *   - Handles HTTP 204 No Content immediately by returning null (no retry).
 *     Callers that receive 204 as a valid "no results" or "success" response should
 *     type their generic as <T | null> and check the return value.
 *   - Reads body as raw text (never throws on empty)
 *   - Retries up to 3 times with 1500ms delay on empty or malformed bodies
 *   - Throws a clear EbayApiError after 3 failed attempts, including a raw body snippet
 *   - Delegates error-status responses to parseEbayError unchanged
 *
 * @param requestFn  Zero-arg async function that performs the full HTTP request.
 *                   Should call getAccessToken() internally so retries get a fresh token.
 * @param context    Label used in error messages (e.g. "getFulfillmentPolicies")
 */
async function ebayFetch<T>(
    requestFn: () => Promise<Response>,
    context: string
): Promise<T> {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1500;

    let lastResponse: Response | null = null;
    let lastRawSnippet = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const response = await requestFn();
        lastResponse = response;

        // Error path: HTTP status >= 400 — delegate to existing handler, no retry
        if (!response.ok) {
            throw await parseEbayError(response, context);
        }

        // Special case: HTTP 204 No Content — a valid success with no body.
        // This is NOT a transient error; do not retry. Return null immediately.
        // Callers that can receive 204 must type their generic as <T | null>
        // and check the return value before accessing properties.
        if (response.status === 204) {
            return null as unknown as T;
        }

        // Read body as raw text — this never throws, always returns a string
        const text = await response.text();
        lastRawSnippet = text.slice(0, 300);

        // Non-empty body: try JSON parse
        if (text.trim() !== "") {
            try {
                return JSON.parse(text) as T;
            } catch {
                // Malformed JSON — fall through to retry logic below
            }
        }

        // Empty or malformed body: retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
            console.warn(
                `[${context}] Attempt ${attempt}: eBay returned empty or malformed body, retrying in ${RETRY_DELAY_MS}ms... Raw: ${lastRawSnippet}`
            );
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }

    // All 3 attempts exhausted — throw with diagnostic info
    throw new EbayApiError(
        `[${context}]: eBay returned an empty or malformed response after 3 attempts`,
        { statusCode: lastResponse?.status }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Policy Getters — Phase 2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getFulfillmentPolicies — EBAY_API_GUIDELINES.md §5
 *
 * GET https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id={marketplace_id}
 * Returns seller's shipping policies for the configured marketplace.
 */
export async function getFulfillmentPolicies(): Promise<FulfillmentPolicy[]> {
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";

    const data = await ebayFetch<{ fulfillmentPolicies: FulfillmentPolicy[] }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                `https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
                {
                    method: "GET",
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );
        },
        "getFulfillmentPolicies"
    );
    return (data.fulfillmentPolicies ?? []) as FulfillmentPolicy[];
}

/**
 * getReturnPolicies — EBAY_API_GUIDELINES.md §6
 *
 * GET https://api.ebay.com/sell/account/v1/return_policy?marketplace_id={marketplace_id}
 * Returns seller's return policies for the configured marketplace.
 */
export async function getReturnPolicies(): Promise<ReturnPolicy[]> {
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";

    const data = await ebayFetch<{ returnPolicies: ReturnPolicy[] }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                `https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
                {
                    method: "GET",
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );
        },
        "getReturnPolicies"
    );
    return (data.returnPolicies ?? []) as ReturnPolicy[];
}

/**
 * getPaymentPolicies — EBAY_API_GUIDELINES.md §7
 *
 * GET https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id={marketplace_id}
 * Returns seller's payment policies for the configured marketplace.
 */
export async function getPaymentPolicies(): Promise<PaymentPolicy[]> {
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";

    const data = await ebayFetch<{ paymentPolicies: PaymentPolicy[] }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                `https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
                {
                    method: "GET",
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );
        },
        "getPaymentPolicies"
    );
    return (data.paymentPolicies ?? []) as PaymentPolicy[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy — Phase 4 Step 2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Suggested category shape from getCategorySuggestions.
 * Only the leaf category is needed for downstream taxonomy calls.
 */
export interface CategorySuggestion {
    categoryId: string;
    categoryName: string;
    categoryTreeNodeLevel: number;
}

/**
 * Raw shape for a single aspect returned by getItemAspectsForCategory.
 * We store the entire aspect array as `requiredAspects` on the ListingObject
 * so Step 3 (Final Assembly) can see the complete schema.
 */
export interface EbayAspect {
    localizedAspectName: string;
    aspectConstraint: {
        aspectDataType: string;
        aspectMode: "FREE_TEXT" | "SELECTION_ONLY";
        aspectRequired: boolean;
        itemToAspectCardinality: "SINGLE" | "MULTI";
        aspectMaxLength?: number;
    };
    aspectValues?: Array<{
        localizedValue: string;
        valueConstraints?: Array<{
            applicableForLocalizedAspectName: string;
            applicableForLocalizedAspectValues: string[];
        }>;
    }>;
}

/**
 * getCategorySuggestions — EBAY_API_GUIDELINES.md §2
 *
 * GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_category_suggestions?q={query}
 *
 * Returns the list of suggested categories for a plain-language query.
 * Callers should take the first (highest-confidence) suggestion's leaf categoryId.
 *
 * @param query  Plain-language item description (e.g. "vintage Pokémon cards")
 */
export async function getCategorySuggestions(query: string): Promise<CategorySuggestion[]> {
    // Map marketplace to category tree ID. 0 = US, 2 = Canada (English)
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
    const categoryTreeId = marketplaceId === "EBAY_CA" ? "2" : "0";
    const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(query)}`;

    // Use <T | null> — this endpoint legitimately returns HTTP 204 No Content
    // when no categories match the query. ebayFetch returns null for 204.
    const data = await ebayFetch<{ categorySuggestions?: unknown[] } | null>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(url, {
                method: "GET",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        },
        "getCategorySuggestions"
    );

    // HTTP 204 = eBay found no categories for this query — valid "no results", not an error
    if (!data) return [];

    // Map to our slim shape — callers only need the leaf category ID and name
    type RawSuggestion = {
        category: { categoryId: string; categoryName: string };
        categoryTreeNodeLevel: number;
    };
    return (data.categorySuggestions ?? [] as RawSuggestion[]).map(
        (s): CategorySuggestion => {
            const raw = s as RawSuggestion;
            return {
                categoryId: raw.category.categoryId,
                categoryName: raw.category.categoryName,
                categoryTreeNodeLevel: raw.categoryTreeNodeLevel,
            };
        }
    );
}

/**
 * getItemAspectsForCategory — EBAY_API_GUIDELINES.md §3
 *
 * GET https://api.ebay.com/commerce/taxonomy/v1/category_tree/{category_tree_id}/get_item_aspects_for_category?category_id={categoryId}
 *
 * Returns the FULL aspect schema for a leaf category — required AND optional.
 * The raw array is stored on ListingObject.requiredAspects and passed verbatim
 * to the Step 3 Gemini prompt so the model can see all constraints.
 *
 * @param categoryId  Leaf eBay category ID (from getCategorySuggestions)
 */
export async function getItemAspectsForCategory(categoryId: string): Promise<EbayAspect[]> {
    // Map marketplace to category tree ID. 0 = US, 2 = Canada (English)
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
    const categoryTreeId = marketplaceId === "EBAY_CA" ? "2" : "0";
    const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`;

    const data = await ebayFetch<{ aspects?: EbayAspect[] }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(url, {
                method: "GET",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        },
        "getItemAspectsForCategory"
    );

    return (data.aspects ?? []) as EbayAspect[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory & Offers — Phase 6
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createInventoryLocation — EBAY_API_GUIDELINES.md §4
 *
 * POST https://api.ebay.com/sell/inventory/v1/location/{merchantLocationKey}
 *
 * Idempotent first-run call. Creates a merchant location if not already set up.
 * Returns 204 No Content on success. If it already exists, eBay returns 409 —
 * we treat that as success (idempotent).
 *
 * NOTE: This function intentionally does NOT use ebayFetch<T> — it expects
 * 204 No Content and never calls response.json(). It is already correct.
 */
export async function createInventoryLocation(): Promise<void> {
    const accessToken = await getAccessToken();
    const merchantLocationKey = process.env.EBAY_MERCHANT_LOCATION_KEY;

    if (!merchantLocationKey) {
        throw new EbayApiError(
            "EBAY_MERCHANT_LOCATION_KEY is not set in environment.",
            { category: "CONFIGURATION" }
        );
    }

    const response = await fetch(
        `https://api.ebay.com/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                location: {
                    address: {
                        addressLine1: process.env.EBAY_LOCATION_ADDRESS_LINE1 ?? "123 Main St",
                        city: process.env.EBAY_LOCATION_CITY ?? "New York",
                        stateOrProvince: process.env.EBAY_LOCATION_STATE ?? "NY",
                        postalCode: process.env.EBAY_LOCATION_POSTAL ?? "10001",
                        country: process.env.EBAY_LOCATION_COUNTRY ?? "US",
                    },
                },
                locationTypes: ["WAREHOUSE"],
                merchantLocationStatus: "ENABLED",
                name: "Materia Magical Staff Primary",
            }),
        }
    );

    // 204 = created, 409 = already exists (idempotent — treat as ok)
    if (!response.ok && response.status !== 409) {
        throw await parseEbayError(response, "createInventoryLocation");
    }
}

/**
 * bulkCreateOrReplaceInventoryItem — EBAY_API_GUIDELINES.md §8
 *
 * POST https://api.ebay.com/sell/inventory/v1/bulk_create_or_replace_inventory_item
 *
 * Creates or updates up to 25 inventory items in a single request.
 * CRITICAL: The HTTP response will be 200 even if individual items fail.
 * We must inspect each item's statusCode in responses[]. See §Error Handling Contract.
 *
 * @param items  Array of InventoryItemInput (max 25)
 * @returns      Array of BulkItemResult, one per input item
 */
export async function bulkCreateOrReplaceInventoryItem(
    items: InventoryItemInput[]
): Promise<BulkItemResult[]> {
    const requests = items.map((item) => {
        // Build product object. Include catalog identifiers when Gemini found them —
        // this allows eBay to match catalog-required categories (Books, Music, etc.)
        // and prevents error 25604 "Product not found" at publishOffer time.
        const product: Record<string, unknown> = {
            title: item.title,
            description: item.description,
            aspects: item.aspects,
            imageUrls: item.imageUrls,
        };
        if (item.productIdentifiers) {
            const id = item.productIdentifiers;
            if (id.isbn?.length) product.isbn = id.isbn;
            if (id.upc?.length) product.upc = id.upc;
            if (id.ean?.length) product.ean = id.ean;
            if (id.mpn) product.mpn = id.mpn;
            if (id.brand) product.brand = id.brand;
        }

        // Fix #5 (Session 26): eBay rejects conditionDescription on NEW items.
        // Strip it from the payload entirely when condition is NEW.
        const conditionUpper = item.condition.toUpperCase();
        const includeConditionDesc =
            conditionUpper !== "NEW" &&
            item.conditionDescription &&
            item.conditionDescription.trim() !== "";

        return {
            sku: item.sku,
            locale: "en_US",
            product,
            condition: item.condition,
            ...(includeConditionDesc ? { conditionDescription: item.conditionDescription } : {}),
            availability: {
                shipToLocationAvailability: {
                    quantity: item.quantity,
                },
            },
        };
    });

    const data = await ebayFetch<{ responses: BulkItemResult[] }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                "https://api.ebay.com/sell/inventory/v1/bulk_create_or_replace_inventory_item",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Accept-Language": "en-US",
                        "Content-Language": "en-US",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ requests }),
                }
            );
        },
        "bulkCreateOrReplaceInventoryItem"
    );

    // Per EBAY_API_GUIDELINES.md §Error Handling Contract:
    // HTTP 200 does NOT mean all items succeeded. Must inspect each responses[i].statusCode.
    return (data.responses ?? []) as BulkItemResult[];
}

/**
 * bulkCreateOffer — EBAY_API_GUIDELINES.md §9
 *
 * POST https://api.ebay.com/sell/inventory/v1/bulk_create_offer
 *
 * Creates up to 25 DRAFT offers in a single request. IMPORTANT: No publish call
 * is made. Created offers are "unpublished" (draft) and the user must activate
 * them manually in eBay Seller Hub.
 *
 * CRITICAL: Same as bulkCreateOrReplaceInventoryItem — HTTP 200 ≠ all succeeded.
 * Inspect each responses[i].statusCode individually.
 *
 * @param offers  Array of OfferInput (max 25)
 * @returns       Array of BulkOfferResult, one per input item
 */
export async function bulkCreateOffer(
    offers: OfferInput[]
): Promise<BulkOfferResult[]> {
    const requests = offers.map((offer) => {
        const listingPolicies: Record<string, unknown> = {
            fulfillmentPolicyId: offer.fulfillmentPolicyId,
            paymentPolicyId: offer.paymentPolicyId,
            returnPolicyId: offer.returnPolicyId,
        };
        // Per EBAY_API_GUIDELINES.md §11: conditionally include bestOfferTerms.
        // autoDeclinePrice is permanently excluded — never add it.
        if (offer.bestOfferTerms) {
            listingPolicies.bestOfferTerms = offer.bestOfferTerms;
        }

        const req: Record<string, unknown> = {
            sku: offer.sku,
            marketplaceId: offer.marketplaceId,
            format: "FIXED_PRICE",
            categoryId: offer.categoryId,
            availableQuantity: offer.quantity,
            pricingSummary: {
                price: {
                    value: offer.priceValue,
                    currency: offer.currency,
                },
            },
            listingPolicies,
            merchantLocationKey: offer.merchantLocationKey,
        };
        // Per §9: optional scheduled-listing start time
        if (offer.listingStartDate) {
            req.listingStartDate = offer.listingStartDate;
        }
        return req;
    });

    const data = await ebayFetch<{ responses: BulkOfferResult[] }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                "https://api.ebay.com/sell/inventory/v1/bulk_create_offer",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Accept-Language": "en-US",
                        "Content-Language": "en-US",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ requests }),
                }
            );
        },
        "bulkCreateOffer"
    );

    return (data.responses ?? []) as BulkOfferResult[];
}

/**
 * createOffer — EBAY_API_GUIDELINES.md §10
 *
 * POST https://api.ebay.com/sell/inventory/v1/offer
 *
 * Fallback for creating a SINGLE draft offer when a bulk attempt fails for
 * an individual item. Returns the offerId on success.
 * NOTE: No publish call is made — the offer remains an unpublished DRAFT.
 *
 * @param offer  Single OfferInput
 * @returns      offerId string on success
 */
export async function createOffer(offer: OfferInput): Promise<string> {
    const listingPolicies: Record<string, unknown> = {
        fulfillmentPolicyId: offer.fulfillmentPolicyId,
        paymentPolicyId: offer.paymentPolicyId,
        returnPolicyId: offer.returnPolicyId,
    };
    // Per EBAY_API_GUIDELINES.md §11: conditionally include bestOfferTerms.
    // autoDeclinePrice is permanently excluded — never add it.
    if (offer.bestOfferTerms) {
        listingPolicies.bestOfferTerms = offer.bestOfferTerms;
    }

    const body: Record<string, unknown> = {
        sku: offer.sku,
        marketplaceId: offer.marketplaceId,
        format: "FIXED_PRICE",
        categoryId: offer.categoryId,
        availableQuantity: offer.quantity,
        pricingSummary: {
            price: {
                value: offer.priceValue,
                currency: offer.currency,
            },
        },
        listingPolicies,
        merchantLocationKey: offer.merchantLocationKey,
    };
    // Per §9: optional scheduled-listing start time
    if (offer.listingStartDate) {
        body.listingStartDate = offer.listingStartDate;
    }

    const data = await ebayFetch<{ offerId: string }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch("https://api.ebay.com/sell/inventory/v1/offer", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Accept-Language": "en-US",
                    "Content-Language": "en-US",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        },
        "createOffer"
    );

    // Validate critical return field — a missing offerId is a silent type lie
    if (!data.offerId || typeof data.offerId !== "string") {
        throw new EbayApiError("createOffer: response missing offerId", {
            statusCode: 200,
        });
    }

    return data.offerId;
}

/**
 * publishOffer — EBAY_API_GUIDELINES.md §12
 *
 * POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish
 *
 * Converts an unpublished offer into an active eBay listing (or a scheduled
 * listing if the offer was created with a listingStartDate in the future).
 *
 * This is the critical step that makes listings visible in Seller Hub and
 * eventually live on eBay. Without this call, offers remain invisible "drafts"
 * that cannot be found in the standard Seller Hub UI.
 *
 * @param offerId  The offerId returned by bulkCreateOffer or createOffer
 * @returns        listingId — the eBay listing item ID (e.g. "110123456789")
 */
export async function publishOffer(offerId: string): Promise<string> {
    const data = await ebayFetch<{ listingId: string }>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Accept-Language": "en-US",
                        "Content-Language": "en-US",
                        "Content-Type": "application/json",
                    },
                }
            );
        },
        "publishOffer"
    );

    // Validate critical return field — a missing listingId is a silent type lie
    if (!data.listingId || typeof data.listingId !== "string") {
        throw new EbayApiError("publishOffer: response missing listingId", {
            statusCode: 200,
        });
    }

    return data.listingId;
}

/**
 * updateOffer — eBay Sell Inventory API (Session 25, Fix for error 25604)
 *
 * PUT https://api.ebay.com/sell/inventory/v1/offer/{offerId}
 *
 * Replaces ALL fields of an existing DRAFT offer with the provided values.
 * Used in the 25604 (catalog match failure) retry path: when publishOffer fails
 * because eBay can't find a catalog product for the current category, the
 * /api/summon route calls updateOffer with a fallback categoryId and then
 * retries publishOffer.
 *
 * NOTE: This is a full-replacement PUT — all fields must be supplied. Partial
 * updates are not supported by eBay's v1 Inventory API.
 *
 * Returns 204 No Content on success — ebayFetch returns null, which we discard.
 *
 * @param offerId  The offer ID to update (from bulkCreateOffer or createOffer)
 * @param offer    Full OfferInput with the new field values (especially categoryId)
 */
export async function updateOffer(offerId: string, offer: OfferInput): Promise<void> {
    const listingPolicies: Record<string, unknown> = {
        fulfillmentPolicyId: offer.fulfillmentPolicyId,
        paymentPolicyId: offer.paymentPolicyId,
        returnPolicyId: offer.returnPolicyId,
    };
    // Per EBAY_API_GUIDELINES.md §11: conditionally include bestOfferTerms.
    // autoDeclinePrice is permanently excluded — never add it.
    if (offer.bestOfferTerms) {
        listingPolicies.bestOfferTerms = offer.bestOfferTerms;
    }

    const body: Record<string, unknown> = {
        sku: offer.sku,
        marketplaceId: offer.marketplaceId,
        format: "FIXED_PRICE",
        categoryId: offer.categoryId,
        availableQuantity: offer.quantity,
        pricingSummary: {
            price: {
                value: offer.priceValue,
                currency: offer.currency,
            },
        },
        listingPolicies,
        merchantLocationKey: offer.merchantLocationKey,
    };
    if (offer.listingStartDate) {
        body.listingStartDate = offer.listingStartDate;
    }

    // updateOffer returns 204 No Content on success — null is the correct return
    await ebayFetch<null>(
        async () => {
            const accessToken = await getAccessToken();
            return fetch(
                `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
                {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Accept-Language": "en-US",
                        "Content-Language": "en-US",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                }
            );
        },
        "updateOffer"
    );
}
