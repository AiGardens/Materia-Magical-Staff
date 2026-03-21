/**
 * Materia Magical Staff — POST /api/summon
 *
 * Final step: takes an array of reviewed ListingObjects and publishes them
 * to eBay. Two modes are supported via the `publishMode` request field:
 *
 *   "schedule"    — Creates inventory item + offer with listingStartDate=14 days
 *                   from now, then publishes the offer. The listing appears in
 *                   Seller Hub as a SCHEDULED listing visible and editable by the
 *                   user. It will go live automatically in 2 weeks unless the user
 *                   cancels or edits it first. This is the safe default.
 *
 *   "publish_now" — Creates inventory item + offer (no start date), then publishes
 *                   immediately. The listing is LIVE on eBay right away.
 *
 * Execution order per EBAY_API_GUIDELINES.md Call Order:
 *   0. validateBestOfferSettings — pre-flight check, halts if violations found
 *   1. createInventoryLocation (idempotent — safe to call every time)
 *   2. bulkCreateOrReplaceInventoryItem  §8  (batches of ≤25)
 *   3. bulkCreateOffer §9  (batches of ≤25)
 *      - "schedule" mode: includes listingStartDate = now + 14 days
 *      - "publish_now" mode: no listingStartDate
 *   4. createOffer fallback §10 for any item that failed in step 3
 *   5. Best Offer rejection retry (omit bestOfferTerms and retry)
 *   6. publishOffer §12 for every successfully created offer
 *      - "schedule": listing goes live at the scheduled date
 *      - "publish_now": listing goes live immediately
 *
 * Response shape:
 *   {
 *     publishMode: "schedule" | "publish_now",
 *     successWithBestOffer: SucceededItem[],
 *     successWithoutBestOffer: SucceededItem[],
 *     failedItems: FailedItem[],
 *     skuToOfferId: Record<string, string>,
 *     skuToListingId: Record<string, string>,
 *     validationViolations?: string[]
 *   }
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { ListingObject } from "@/types";
import {
    createInventoryLocation,
    bulkCreateOrReplaceInventoryItem,
    bulkCreateOffer,
    createOffer,
    publishOffer,
    updateOffer,
    validateBestOfferSettings,
    buildBestOfferTerms,
    EbayApiError,
    type InventoryItemInput,
    type OfferInput,
    type BulkItemResult,
    type BulkOfferResult,
    type EbayErrorObject,
} from "@/lib/ebayService";

const BATCH_SIZE = 25;

/**
 * Number of days in the future for scheduled listings.
 * 14 days gives the user a comfortable review window in Seller Hub.
 */
const SCHEDULE_DAYS = 14;

/**
 * eBay error codes for Best Offer category ineligibility.
 * Known related codes: 25008 (feature not supported), 25009 (not available for category).
 */
const BEST_OFFER_INELIGIBLE_ERROR_IDS = new Set<number>([25008, 25009]);

/**
 * eBay error 25604: "Input error. Seller Inventory Service can not publish the data.
 * Product not found."
 *
 * Root cause: the offer's categoryId is a catalog-required category (e.g. Books,
 * Music, Movies, Video Games) and eBay could not match the inventory item to a
 * product in its catalog (no UPC/ISBN/EPID provided, or the identifiers did not
 * match any catalog entry).
 *
 * Fix: on 25604, iterate through the listing's categorySuggestions fallbacks.
 * For each fallback category, call updateOffer to change the categoryId, then
 * retry publishOffer. A non-catalog-required sibling or parent category will
 * typically succeed.
 */
const PRODUCT_NOT_FOUND_ERROR_ID = 25604;

/** Matches error message text patterns eBay uses for Best Offer category rejection */
function isBestOfferIneligibleError(errors: EbayErrorObject[]): boolean {
    for (const err of errors) {
        if (err.errorId && BEST_OFFER_INELIGIBLE_ERROR_IDS.has(err.errorId)) return true;
        const msg = (err.message ?? "").toLowerCase() + (err.longMessage ?? "").toLowerCase();
        if (
            msg.includes("best offer") &&
            (msg.includes("not supported") ||
                msg.includes("not available") ||
                msg.includes("not eligible") ||
                msg.includes("not allowed"))
        ) {
            return true;
        }
    }
    return false;
}

/** Returns an ISO-8601 UTC timestamp N days from now */
function daysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PublishMode = "schedule" | "publish_now";

interface GlobalPrefs {
    shippingPolicyId: string;
    returnPolicyId: string;
    paymentPolicyId: string;
}

interface SucceededItem {
    listingId: string;
    sku: string;
    title: string;
    offerId: string;
    /** The live/scheduled eBay listing ID returned by publishOffer */
    ebayListingId?: string;
    /** Message shown in the "submitted without Best Offer" category (category rejected it) */
    notice?: string;
}

interface FailedItem {
    listingId: string;
    sku: string;
    title: string;
    stage: "inventory" | "offer" | "publish";
    errors: EbayErrorObject[];
}

interface SummonResponse {
    publishMode: PublishMode;
    /** Listings where bestOfferTerms was sent and accepted by eBay */
    successWithBestOffer: SucceededItem[];
    /** Listings published without Best Offer (user disabled it or category rejected it) */
    successWithoutBestOffer: SucceededItem[];
    failedItems: FailedItem[];
    skuToOfferId: Record<string, string>;
    /** Maps sku → eBay listingId for successfully published items */
    skuToListingId: Record<string, string>;
    /** Only present when pre-flight validation failed. No API calls were made. */
    validationViolations?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Chunk an array into sub-arrays of max `size` length */
function chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/** Convert a ListingObject into the InventoryItemInput shape for §8 */
function toInventoryInput(listing: ListingObject): InventoryItemInput {
    const aspects: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(listing.itemSpecifics ?? {})) {
        aspects[key] = Array.isArray(val) ? val : [val];
    }

    return {
        sku: listing.sku,
        title: listing.title,
        description: listing.descriptionHtml,
        aspects,
        imageUrls: listing.imageUrls,
        condition: listing.condition,
        conditionDescription: listing.conditionDescription || undefined,
        quantity: 1,
        // Pass verified catalog identifiers through to the eBay product object.
        // When present, eBay uses these for catalog matching, preventing error 25604.
        productIdentifiers: listing.productIdentifiers ?? undefined,
    };
}

/**
 * Convert a ListingObject into the OfferInput shape for §9/§10.
 * Uses buildBestOfferTerms to conditionally attach Best Offer payload.
 * Pass includeBestOffer=false to explicitly omit bestOfferTerms (retry path).
 * Pass listingStartDate to schedule the listing instead of going live immediately.
 */
function toOfferInput(
    listing: ListingObject,
    prefs: GlobalPrefs,
    includeBestOffer = true,
    listingStartDate?: string
): OfferInput {
    return {
        sku: listing.sku,
        categoryId: listing.ebayCategoryId,
        priceValue: listing.finalPriceCAD.toFixed(2),
        currency: "CAD",
        quantity: 1,
        fulfillmentPolicyId: prefs.shippingPolicyId,
        returnPolicyId: prefs.returnPolicyId,
        paymentPolicyId: prefs.paymentPolicyId,
        merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY ?? "",
        marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
        listingStartDate,
        bestOfferTerms: includeBestOffer ? buildBestOfferTerms(listing) : null,
    };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    // Auth guard
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let listings: ListingObject[];
    let globalPrefs: GlobalPrefs;
    let publishMode: PublishMode;

    try {
        const body = await request.json();
        listings = body.listings;
        globalPrefs = body.globalPrefs;
        publishMode = body.publishMode === "publish_now" ? "publish_now" : "schedule";
    } catch {
        return NextResponse.json(
            { error: "Invalid request body" },
            { status: 400 }
        );
    }

    if (!listings?.length) {
        return NextResponse.json(
            { error: "No listings provided" },
            { status: 400 }
        );
    }

    if (
        !globalPrefs?.shippingPolicyId ||
        !globalPrefs?.returnPolicyId ||
        !globalPrefs?.paymentPolicyId
    ) {
        return NextResponse.json(
            { error: "Incomplete global preferences — shipping, return, and payment policies are all required." },
            { status: 400 }
        );
    }

    // ── Fix #4 (Session 26): Validate EBAY_MERCHANT_LOCATION_KEY ─────────────
    const merchantLocationKey = process.env.EBAY_MERCHANT_LOCATION_KEY;
    if (!merchantLocationKey || merchantLocationKey.trim() === "") {
        return NextResponse.json(
            { error: "EBAY_MERCHANT_LOCATION_KEY is not set or empty. Configure it in your .env file before publishing." },
            { status: 500 }
        );
    }

    // ── Fix #2 (Session 26): Warn if image URLs are localhost (eBay can't reach them)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
        console.warn(
            "\n" +
            "╔══════════════════════════════════════════════════════════════════╗\n" +
            "║  ⚠ WARNING: NEXT_PUBLIC_APP_URL is localhost!                   ║\n" +
            "║  eBay CANNOT reach localhost to download your product images.   ║\n" +
            "║  Use 'npm run dev:tunnel' to start a public tunnel,             ║\n" +
            "║  or set NEXT_PUBLIC_APP_URL to your public domain.              ║\n" +
            "╚══════════════════════════════════════════════════════════════════╝\n"
        );
    }

    // Compute schedule date once (consistent across all items in this batch)
    const listingStartDate: string | undefined =
        publishMode === "schedule" ? daysFromNow(SCHEDULE_DAYS) : undefined;

    // ── Step 0: Pre-flight validation ─────────────────────────────────────────

    // Best Offer validation
    const violations = validateBestOfferSettings(listings);

    // Fix #3 (Session 26): Price guard — reject any listing at $0 or negative
    for (const listing of listings) {
        if (!listing.finalPriceCAD || listing.finalPriceCAD <= 0) {
            violations.push(
                `${listing.title || listing.sku}: Listing price is $${listing.finalPriceCAD?.toFixed(2) ?? "0.00"} — eBay requires a price greater than zero.`
            );
        }
    }

    if (violations.length > 0) {
        return NextResponse.json<SummonResponse>({
            publishMode,
            successWithBestOffer: [],
            successWithoutBestOffer: [],
            failedItems: [],
            skuToOfferId: {},
            skuToListingId: {},
            validationViolations: violations,
        });
    }

    const failedItems: FailedItem[] = [];
    const skuToOfferId: Record<string, string> = {};
    const skuToListingId: Record<string, string> = {};
    const successWithBestOffer: SucceededItem[] = [];
    const successWithoutBestOffer: SucceededItem[] = [];

    // Mutable listing state: Best Offer retry logic may flip bestOfferEligible=false
    const listingState = new Map<string, ListingObject>(
        listings.map((l) => [l.sku, { ...l }])
    );

    // ── Step 1: createInventoryLocation (idempotent) ─────────────────────────
    try {
        await createInventoryLocation();
    } catch (err) {
        console.warn("[summon] createInventoryLocation warning:", err);
    }

    // ── Step 2: bulkCreateOrReplaceInventoryItem ──────────────────────────────
    const inventorySuccesses: ListingObject[] = [];
    const inventoryInputs = listings.map(toInventoryInput);
    const inventoryBatches = chunk(inventoryInputs, BATCH_SIZE);
    const inventoryListingBatches = chunk(listings, BATCH_SIZE);

    for (let bi = 0; bi < inventoryBatches.length; bi++) {
        let results: BulkItemResult[];

        try {
            results = await bulkCreateOrReplaceInventoryItem(inventoryBatches[bi]);
        } catch (err) {
            // Fix #7 (Session 26): Log full error details for diagnosis
            console.error(
                `[summon] bulkCreateOrReplaceInventoryItem BATCH ${bi} FAILED:`,
                err instanceof EbayApiError
                    ? { message: err.message, errorId: err.errorId, statusCode: err.statusCode, longMessage: err.longMessage, parameters: err.parameters }
                    : err
            );
            const batchListings = inventoryListingBatches[bi];
            for (const listing of batchListings) {
                failedItems.push({
                    listingId: listing.id,
                    sku: listing.sku,
                    title: listing.title,
                    stage: "inventory",
                    errors: [
                        {
                            message:
                                err instanceof EbayApiError
                                    ? err.message
                                    : err instanceof Error
                                        ? err.message
                                        : "Unknown error during inventory creation",
                            longMessage:
                                err instanceof EbayApiError ? err.longMessage : undefined,
                            errorId:
                                err instanceof EbayApiError ? err.errorId : undefined,
                            category:
                                err instanceof EbayApiError ? err.category : undefined,
                        },
                    ],
                });
            }
            continue;
        }

        for (let ri = 0; ri < results.length; ri++) {
            const result = results[ri];
            const listing = inventoryListingBatches[bi][ri];
            if (!listing) continue;

            if (result.statusCode === 200 || result.statusCode === 201) {
                inventorySuccesses.push(listing);
            } else {
                failedItems.push({
                    listingId: listing.id,
                    sku: listing.sku,
                    title: listing.title,
                    stage: "inventory",
                    errors: result.errors ?? [],
                });
            }
        }
    }

    if (inventorySuccesses.length === 0) {
        return NextResponse.json<SummonResponse>({
            publishMode,
            successWithBestOffer: [],
            successWithoutBestOffer: [],
            failedItems,
            skuToOfferId,
            skuToListingId,
        });
    }

    // ── Step 3: bulkCreateOffer ───────────────────────────────────────────────
    const offerInputs = inventorySuccesses.map(l =>
        toOfferInput(l, globalPrefs, true, listingStartDate)
    );
    const offerBatches = chunk(offerInputs, BATCH_SIZE);
    const offerListingBatches = chunk(inventorySuccesses, BATCH_SIZE);

    // Collect items that need the single createOffer fallback
    const fallbackNeeded: ListingObject[] = [];

    for (let bi = 0; bi < offerBatches.length; bi++) {
        let results: BulkOfferResult[];

        try {
            results = await bulkCreateOffer(offerBatches[bi]);
        } catch (err) {
            for (const listing of offerListingBatches[bi]) {
                fallbackNeeded.push(listing);
                console.warn(`[summon] bulkCreateOffer batch failed for sku ${listing.sku}:`, err);
            }
            continue;
        }

        for (let ri = 0; ri < results.length; ri++) {
            const result = results[ri];
            const listing = offerListingBatches[bi][ri];
            if (!listing) continue;

            if (
                (result.statusCode === 200 || result.statusCode === 201) &&
                result.offerId
            ) {
                skuToOfferId[listing.sku] = result.offerId;
            } else {
                if (
                    result.errors?.length &&
                    isBestOfferIneligibleError(result.errors) &&
                    offerBatches[bi][ri]?.bestOfferTerms
                ) {
                    const state = listingState.get(listing.sku);
                    if (state) {
                        state.bestOfferEligible = false;
                        state.acceptOffers = false;
                        state.autoAcceptPriceCAD = null;
                    }
                    fallbackNeeded.push({ ...listing, _bestOfferRejected: true } as ListingObject & { _bestOfferRejected: boolean });
                    console.warn(`[summon] Best Offer rejected by eBay for sku ${listing.sku}, will retry without bestOfferTerms`);
                } else {
                    fallbackNeeded.push(listing);
                    console.warn(`[summon] Offer batch item failed for sku ${listing.sku}, will try fallback`);
                }
            }
        }
    }

    // ── Step 4: createOffer fallback (and Best Offer rejection retry) ─────────
    for (const listing of fallbackNeeded) {
        const isBestOfferRetry = !!(listing as ListingObject & { _bestOfferRejected?: boolean })._bestOfferRejected;
        const offerInput = toOfferInput(listing, globalPrefs, !isBestOfferRetry, listingStartDate);

        try {
            const offerId = await createOffer(offerInput);
            skuToOfferId[listing.sku] = offerId;
            // Tag as best-offer-rejected if this was a retry, so publish step can categorise it
            if (isBestOfferRetry) {
                (listing as ListingObject & { _bestOfferRejected: boolean })._bestOfferRejected = true;
            }
        } catch (err) {
            const errors: EbayErrorObject[] =
                err instanceof EbayApiError
                    ? [
                        {
                            errorId: err.errorId,
                            domain: err.domain,
                            category: err.category,
                            message: err.message,
                            longMessage: err.longMessage,
                            parameters: err.parameters,
                        },
                    ]
                    : [{ message: String(err) }];

            failedItems.push({
                listingId: listing.id,
                sku: listing.sku,
                title: listing.title,
                stage: "offer",
                errors,
            });
        }
    }

    // ── Step 5: publishOffer for all successfully created offers ──────────────
    // Every offer (regardless of mode) must be published. In "schedule" mode,
    // the listingStartDate makes the listing appear as scheduled; in
    // "publish_now" mode it goes live immediately.
    //
    // There is no bulk publish endpoint — we call publishOffer one at a time.
    // Items that succeed offer creation but fail publish are added to failedItems
    // with stage: "publish".

    // Build list: {listing, offerId, hadBestOffer, isBestOfferRejected}
    const toPublish: Array<{
        listing: ListingObject;
        offerId: string;
        hadBestOffer: boolean;
        isBestOfferRejected: boolean;
    }> = [];

    const failedOfferSkus = new Set(
        failedItems.filter(f => f.stage === "offer").map(f => f.sku)
    );

    for (const listing of [...inventorySuccesses, ...fallbackNeeded]) {
        const offerId = skuToOfferId[listing.sku];
        if (!offerId) continue;
        if (failedOfferSkus.has(listing.sku)) continue;
        // Avoid duplicates — inventorySuccesses and fallbackNeeded may overlap on retry items
        if (toPublish.some(p => p.listing.sku === listing.sku)) continue;

        const isBestOfferRejected = !!(listing as ListingObject & { _bestOfferRejected?: boolean })._bestOfferRejected;
        const hadBestOffer = !isBestOfferRejected && !!(buildBestOfferTerms(listing));

        toPublish.push({ listing, offerId, hadBestOffer, isBestOfferRejected });
    }

    for (const { listing, offerId, hadBestOffer, isBestOfferRejected } of toPublish) {
        // Build ordered list of categories to attempt for this item.
        // Index 0 = original category (already set on the offer, no updateOffer needed).
        // Index 1+ = fallbacks from categorySuggestions (deduplicated).
        const categoriesToAttempt: Array<{ categoryId: string; categoryName: string }> = [
            { categoryId: listing.ebayCategoryId, categoryName: listing.ebayCategoryId },
        ];
        if (listing.categorySuggestions) {
            for (const s of listing.categorySuggestions) {
                if (!categoriesToAttempt.some(c => c.categoryId === s.categoryId)) {
                    categoriesToAttempt.push({ categoryId: s.categoryId, categoryName: s.categoryName });
                }
            }
        }

        let publishSucceeded = false;
        let lastPublishError: EbayApiError | null = null;

        for (let catIdx = 0; catIdx < categoriesToAttempt.length; catIdx++) {
            const { categoryId, categoryName } = categoriesToAttempt[catIdx];

            // For fallback categories (index > 0): update the offer's categoryId first
            if (catIdx > 0) {
                try {
                    const fallbackOfferInput = toOfferInput(
                        { ...listing, ebayCategoryId: categoryId } as ListingObject,
                        globalPrefs,
                        !isBestOfferRejected,
                        listingStartDate
                    );
                    await updateOffer(offerId, fallbackOfferInput);
                    console.warn(
                        `[summon] 25604 fallback [${catIdx}/${categoriesToAttempt.length - 1}]: ` +
                        `updated offer ${offerId} for sku ${listing.sku} to category ${categoryId} (${categoryName})`
                    );
                } catch (updateErr) {
                    console.warn(
                        `[summon] updateOffer failed for fallback category ${categoryId} (sku ${listing.sku}):`,
                        updateErr
                    );
                    // Can't update offer — skip this fallback, try next
                    continue;
                }
            }

            try {
                const ebayListingId = await publishOffer(offerId);
                skuToListingId[listing.sku] = ebayListingId;

                if (catIdx > 0) {
                    console.log(
                        `[summon] 25604 resolved: sku ${listing.sku} published successfully ` +
                        `under fallback category ${categoryId} (${categoryName})`
                    );
                }

                const succeededItem: SucceededItem = {
                    listingId: listing.id,
                    sku: listing.sku,
                    title: listing.title,
                    offerId,
                    ebayListingId,
                };

                if (isBestOfferRejected) {
                    succeededItem.notice = `Best Offer is not available for this category and has been disabled for this listing.`;
                    successWithoutBestOffer.push(succeededItem);
                } else if (hadBestOffer) {
                    successWithBestOffer.push(succeededItem);
                } else {
                    successWithoutBestOffer.push(succeededItem);
                }

                publishSucceeded = true;
                break; // No more category attempts needed
            } catch (err) {
                const isProduct25604 =
                    err instanceof EbayApiError &&
                    err.errorId === PRODUCT_NOT_FOUND_ERROR_ID;

                if (isProduct25604 && catIdx < categoriesToAttempt.length - 1) {
                    // 25604 with more fallback categories remaining — retry with next category
                    lastPublishError = err;
                    console.warn(
                        `[summon] publishOffer error 25604 for sku ${listing.sku} ` +
                        `(category ${categoryId}) — will try fallback category ${catIdx + 1}`
                    );
                    continue;
                }

                // Terminal failure: non-25604 error, or 25604 with no more fallbacks
                const errors: EbayErrorObject[] =
                    err instanceof EbayApiError
                        ? [
                            {
                                errorId: err.errorId,
                                domain: err.domain,
                                category: err.category,
                                message: err.message,
                                longMessage: err.longMessage,
                                parameters: err.parameters,
                            },
                        ]
                        : [{ message: String(err) }];

                if (isProduct25604) {
                    const tried = categoriesToAttempt.map(c => `${c.categoryId}(${c.categoryName})`).join(", ");
                    console.error(
                        `[summon] publishOffer error 25604 exhausted all ${categoriesToAttempt.length} ` +
                        `category fallbacks for sku ${listing.sku}. Tried: ${tried}`
                    );
                } else {
                    console.error(
                        `[summon] publishOffer failed for sku ${listing.sku} (offerId ${offerId}):`, err
                    );
                }

                failedItems.push({
                    listingId: listing.id,
                    sku: listing.sku,
                    title: listing.title,
                    stage: "publish",
                    errors,
                });
                break;
            }
        }

        // If we exhausted the loop without breaking on success (edge case: all updateOffer calls failed)
        if (!publishSucceeded && !failedItems.some(f => f.sku === listing.sku && f.stage === "publish")) {
            const errors: EbayErrorObject[] = lastPublishError
                ? [{
                    errorId: lastPublishError.errorId,
                    domain: lastPublishError.domain,
                    category: lastPublishError.category,
                    message: lastPublishError.message,
                    longMessage: lastPublishError.longMessage,
                    parameters: lastPublishError.parameters,
                }]
                : [{ message: "publishOffer: all category fallbacks failed (updateOffer errors prevented retry)" }];

            failedItems.push({
                listingId: listing.id,
                sku: listing.sku,
                title: listing.title,
                stage: "publish",
                errors,
            });
        }
    }

    return NextResponse.json<SummonResponse>({
        publishMode,
        successWithBestOffer,
        successWithoutBestOffer,
        failedItems,
        skuToOfferId,
        skuToListingId,
    });
}
