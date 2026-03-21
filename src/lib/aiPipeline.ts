/**
 * Materia Magical Staff — AI Processing Pipeline
 *
 * This module orchestrates the full 4-step AI pipeline for each Cluster.
 * It is a pure server-side module (no "use client") — it is only ever called
 * from API routes.
 *
 * Step 1 — Vision Analysis + Search Grounding (gemini-3-flash)
 *   Sends up to 5 cluster images in a single multimodal payload.
 *   Outputs: itemIdentity, pricingRationale, pricingSources, suggestedPriceCAD,
 *            confidenceScores.
 *   If priceOverride is set, pricing fields are skipped.
 *
 * Step 2 — eBay Taxonomy
 *   getCategorySuggestions(itemIdentity) → best leaf ebayCategoryId
 *   getItemAspectsForCategory(ebayCategoryId) → full aspect schema (requiredAspects)
 *
 * Step 3 — Final Assembly (gemini-3-flash)
 *   Feeds itemIdentity, userNotes, and full requiredAspects schema with
 *   explicit 3-point instructions about required / optional / SELECTION_ONLY
 *   constraint handling (per architecture decision in BUILD_LOG.md).
 *   Outputs: title, descriptionHtml, condition, conditionDescription,
 *            itemSpecifics, dimensions, weight.
 *
 * Step 3.5 — Gap Fill (relaxed confidence rules)
 *   Fills remaining empty aspects with reasonable-confidence values.
 *   Anti-hallucination still applies to factual specifics; categorical
 *   fields use best-call approach.
 *
 * Step 3.6 — Required Aspects Self-Healing (Session 23, Fix #2)
 *   Targeted Gemini pass for any REQUIRED aspects still empty after 3.5.
 *   Uses MANDATORY best-guess rules: returning nothing is not an option.
 *   Retries up to 3 times.
 *
 * Step 3.7 — Programmatic Absolute Fallback (Session 23, Fix #2)
 *   Deterministic fallback for any REQUIRED aspects still empty after 3.6.
 *   SELECTION_ONLY: scans allowedValues for generic values in priority order.
 *   FREE_TEXT: sets "Not Specified".
 *   Guarantees 100% required-aspect population before listing reaches summon.
 *
 * Step 4 — Offer Calculation
 *   Applies priceOverride or suggestedPriceCAD → finalPriceCAD.
 *   Applies global autoAcceptPercentage → autoAcceptPriceCAD.
 */

import { GoogleGenAI } from "@google/genai";
import * as fsPromises from "fs/promises";
import * as nodePath from "path";
import type { Cluster } from "@/types";
import type { ListingObject } from "@/types";
import type { ProductIdentifiers } from "@/types";
import {
    getCategorySuggestions,
    getItemAspectsForCategory,
} from "@/lib/ebayService";
import { parseAspectSchema } from "@/lib/aspectParser";
import { validateAndNormalizeAspects } from "@/lib/aspectValidator";

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Client
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: We intentionally do NOT import env.ts here — this file runs server-side
// inside an API route that already bootstraps env validation. Using process.env
// directly avoids the Node.js module-load order problem on Edge/RSC.
function getGeminiClient(): GoogleGenAI {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set.");
    return new GoogleGenAI({ apiKey: key });
}

// Model identifiers — confirmed against Google AI docs.
const FLASH_MODEL = "gemini-3-flash-preview";
const PRO_MODEL = "gemini-3.1-pro-preview";

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a public image URL and return it as a base64-encoded Part for Gemini.
 * We fetch via the local filesystem for /uploads/* to avoid loopback latency,
 * falling back to a network fetch for any fully-qualified external URL.
 */
async function urlToGeminiPart(
    imageUrl: string
): Promise<{ inlineData: { mimeType: string; data: string } }> {
    // Resolve /uploads/... relative to the public dir on disk
    if (imageUrl.startsWith("/uploads/")) {
        const filePath = nodePath.join(process.cwd(), "public", imageUrl);
        const buffer = await fsPromises.readFile(filePath);
        // Detect mime type from extension
        const ext = imageUrl.split(".").pop()?.toLowerCase() ?? "jpg";
        const mimeMap: Record<string, string> = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            gif: "image/gif",
        };
        const mimeType = mimeMap[ext] ?? "image/jpeg";
        return { inlineData: { mimeType, data: buffer.toString("base64") } };
    }

    // Fallback: full URL fetch
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${imageUrl}`);
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const mimeType = response.headers.get("content-type") ?? "image/jpeg";
    return { inlineData: { mimeType, data: buffer.toString("base64") } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline input/output types
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineInput {
    cluster: Cluster;
    /** The base URL of the app (e.g. https://mysite.com) — used to build full image URLs */
    appUrl: string;
    /** Global user preferences for offer calculation */
    globalPrefs: {
        acceptOffers: boolean;
        autoAcceptThreshold: number | null; // percentage (0-100), e.g. 90
    };
    /** Pass "pro" to use gemini-2.5-pro instead of flash (for Dig Deeper) */
    modelOverride?: "flash" | "pro";
}

export interface PipelineResult {
    listing: ListingObject;
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Normalization (Fix #1 — Session 26)
// ─────────────────────────────────────────────────────────────────────────────
//
// eBay's ConditionEnum has EXACT valid strings. Gemini may generate values
// that don't exist (e.g. USED_EXCELLENT). This function maps any AI-generated
// condition to the closest valid eBay enum.

const VALID_EBAY_CONDITIONS: readonly string[] = [
    "NEW",
    "NEW_OTHER",
    "NEW_WITH_DEFECTS",
    "CERTIFIED_REFURBISHED",
    "EXCELLENT_REFURBISHED",
    "VERY_GOOD_REFURBISHED",
    "GOOD_REFURBISHED",
    "SELLER_REFURBISHED",
    "LIKE_NEW",
    "USED_VERY_GOOD",
    "USED_GOOD",
    "USED_ACCEPTABLE",
    "FOR_PARTS_OR_NOT_WORKING",
];

const CONDITION_ALIASES: Record<string, string> = {
    // Common AI hallucinations → correct eBay enums
    "USED_EXCELLENT":           "USED_VERY_GOOD",
    "EXCELLENT":                "USED_VERY_GOOD",
    "VERY_GOOD":                "USED_VERY_GOOD",
    "GOOD":                     "USED_GOOD",
    "ACCEPTABLE":               "USED_ACCEPTABLE",
    "USED":                     "USED_GOOD",
    "PRE_OWNED":                "USED_GOOD",
    "PREOWNED":                 "USED_GOOD",
    "PRE-OWNED":                "USED_GOOD",
    "REFURBISHED":              "SELLER_REFURBISHED",
    "MANUFACTURER_REFURBISHED": "CERTIFIED_REFURBISHED",
    "PARTS":                    "FOR_PARTS_OR_NOT_WORKING",
    "NOT_WORKING":              "FOR_PARTS_OR_NOT_WORKING",
    "BROKEN":                   "FOR_PARTS_OR_NOT_WORKING",
    "MINT":                     "LIKE_NEW",
    "NEAR_MINT":                "LIKE_NEW",
    "OPEN_BOX":                 "NEW_OTHER",
    "OPENED":                   "LIKE_NEW",
};

function normalizeCondition(raw: string): string {
    const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");

    // Direct match: already a valid eBay enum
    if (VALID_EBAY_CONDITIONS.includes(upper)) {
        return upper;
    }

    // Alias match
    if (CONDITION_ALIASES[upper]) {
        console.log(`[normalizeCondition] Mapped "${raw}" → "${CONDITION_ALIASES[upper]}"`);
        return CONDITION_ALIASES[upper];
    }

    // Fuzzy substring match: check if any valid condition is contained in the input
    for (const valid of VALID_EBAY_CONDITIONS) {
        if (upper.includes(valid)) {
            console.log(`[normalizeCondition] Fuzzy matched "${raw}" → "${valid}"`);
            return valid;
        }
    }

    // Last resort: default to USED_GOOD (safe middle-of-the-road value)
    console.warn(`[normalizeCondition] Unknown condition "${raw}", defaulting to USED_GOOD`);
    return "USED_GOOD";
}

// ─────────────────────────────────────────────────────────────────────────────
// Title Truncation Safety Net (Fix #6 — Session 26)
// ─────────────────────────────────────────────────────────────────────────────
//
// Word-aware truncation that never chops mid-word. Only used as a last-resort
// fallback if the AI title shortener also fails.

function wordAwareTruncate(title: string, maxLen: number): string {
    if (title.length <= maxLen) return title;
    const truncated = title.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    // If there's a space, cut at the last complete word
    if (lastSpace > maxLen * 0.4) {
        return truncated.substring(0, lastSpace);
    }
    // No good word boundary — just return the raw cut (very rare edge case)
    return truncated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 output shape (from Gemini)
// ─────────────────────────────────────────────────────────────────────────────

interface Step1Output {
    itemIdentity: string;
    pricingRationale: string;
    pricingSources: string[];
    suggestedPriceCAD: number | null;
    confidenceScores: {
        productDetection: number;
        pricing: number;
        packaging: number;
        condition: number;
    };
    /**
     * Verified catalog identifiers. null if none could be confirmed.
     * Populated only when Gemini read the identifier from the images OR
     * confirmed it through a search result that explicitly matches this
     * exact product (title + edition + region + year all match).
     */
    productIdentifiers: ProductIdentifiers | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 output shape (from Gemini)
// ─────────────────────────────────────────────────────────────────────────────

interface Step3Output {
    title: string;
    descriptionHtml: string;
    condition: string;
    conditionDescription: string;
    itemSpecifics: Record<string, string | string[]>;
    aspectCompletionScore: number | null;
    dimensions: { length: number; width: number; height: number; unit: string };
    weight: { value: number; unit: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
    const { cluster, appUrl, globalPrefs, modelOverride } = input;
    const ai = getGeminiClient();
    const modelId = modelOverride === "pro" ? PRO_MODEL : FLASH_MODEL;

    // Build absolute image URLs from relative /uploads/... paths
    const absoluteImageUrls = cluster.images.map((img) =>
        img.url.startsWith("/") ? `${appUrl}${img.url}` : img.url
    );
    const mainImageUrl =
        cluster.images.find((img) => img.id === cluster.mainImageId)?.url ?? cluster.images[0]?.url;
    const absoluteMainImageUrl = mainImageUrl?.startsWith("/")
        ? `${appUrl}${mainImageUrl}`
        : mainImageUrl;

    // ─── Step 1: Vision Analysis + Search Grounding ───────────────────────────
    const step1 = await runStep1({
        ai,
        modelId,
        cluster,
        absoluteImageUrls,
    });

    // ─── Step 2: eBay Taxonomy ─────────────────────────────────────────────────
    const { ebayCategoryId, categorySuggestions, requiredAspects, aspectSchema } = await runStep2(step1.itemIdentity);

    // ─── Step 3: Final Assembly ────────────────────────────────────────────────
    const step3 = await runStep3({
        ai,
        modelId,
        itemIdentity: step1.itemIdentity,
        userNotes: cluster.userNotes,
        aspectSchema, // Pass strictly typed schema instead of raw EbayAspect[]
    });

    // ─── Step 3.5: Gap Fill (relaxed confidence rules) ────────────────────────
    const afterStep3Point5 = await runStep3Point5({
        ai,
        modelId,
        itemIdentity: step1.itemIdentity,
        aspectSchema,
        currentItemSpecifics: step3.itemSpecifics,
    });

    // ─── Step 3.6: Required Aspects Self-Healing ──────────────────────────────
    const afterStep3Point6 = await runStep3Point6({
        ai,
        modelId,
        itemIdentity: step1.itemIdentity,
        aspectSchema,
        currentItemSpecifics: afterStep3Point5,
    });

    // ─── Step 3.7: Programmatic Absolute Fallback ─────────────────────────────
    const filledItemSpecifics = runStep3Point7({
        aspectSchema,
        currentItemSpecifics: afterStep3Point6,
    });

    const populatedCount = Object.keys(filledItemSpecifics).length;
    const totalCount = Array.isArray(aspectSchema) ? aspectSchema.length : 0;
    const finalAspectCompletionScore =
        totalCount > 0 ? Math.round((populatedCount / totalCount) * 100) : null;

    // ─── Step 4: Offer Calculation ─────────────────────────────────────────────
    const { finalPriceCAD, acceptOffers, autoAcceptPriceCAD, bestOfferEligible } = runStep4({
        priceOverride: cluster.priceOverride,
        suggestedPriceCAD: step1.suggestedPriceCAD,
        globalPrefs,
    });

    // ─── Assemble final ListingObject ─────────────────────────────────────────
    const sku = `MM-${Date.now()}-${cluster.id.slice(0, 6)}`;

    const listing: ListingObject = {
        id: cluster.id,
        status: "reviewed",

        // Raw inputs
        imageUrls: absoluteImageUrls,
        mainImageUrl: absoluteMainImageUrl ?? absoluteImageUrls[0],
        userNotes: cluster.userNotes,
        priceOverride: cluster.priceOverride,

        // Step 1 outputs
        itemIdentity: step1.itemIdentity,
        pricingRationale: step1.pricingRationale,
        pricingSources: step1.pricingSources,
        suggestedPriceCAD: step1.suggestedPriceCAD,
        confidenceScores: step1.confidenceScores,
        productIdentifiers: step1.productIdentifiers ?? null,

        // Step 2 outputs
        ebayCategoryId,
        categorySuggestions,  // Top 3 for publish-time category fallback (error 25604)
        requiredAspects,
        aspectSchema,
        bestOfferEligible,

        // Step 3 outputs — normalize condition to valid eBay enum
        title: step3.title,
        descriptionHtml: step3.descriptionHtml,
        condition: normalizeCondition(step3.condition),
        conditionDescription:
            normalizeCondition(step3.condition) === "NEW" ? "" : step3.conditionDescription,
        itemSpecifics: filledItemSpecifics,
        aspectCompletionScore: finalAspectCompletionScore,
        dimensions: step3.dimensions as ListingObject["dimensions"],
        weight: step3.weight as ListingObject["weight"],

        // Step 4 outputs
        finalPriceCAD,
        acceptOffers,
        autoAcceptPriceCAD,

        // Publishing (populated in Phase 6)
        sku,
        ebayInventoryItemResponse: null,
        ebayOfferResponse: null,
        ebayError: null,
    };

    return { listing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 implementation
// ─────────────────────────────────────────────────────────────────────────────

async function runStep1(params: {
    ai: GoogleGenAI;
    modelId: string;
    cluster: Cluster;
    absoluteImageUrls: string[];
}): Promise<Step1Output> {
    const { ai, modelId, cluster } = params;
    const hasPriceOverride = cluster.priceOverride !== null;

    // Take at most 5 images per spec — map to local /uploads/... paths for efficient disk reads
    const localImageUrls = cluster.images
        .slice(0, 5)
        .map((img) => img.url);

    const imageParts = await Promise.all(localImageUrls.map(urlToGeminiPart));

    const pricingInstruction = hasPriceOverride
        ? `PRICING NOTE: The user has manually set a price of ${cluster.priceOverride} CAD for this item.
Do NOT perform any pricing research or suggest a price.
Set suggestedPriceCAD to null and pricingRationale to "Price manually set by user to ${cluster.priceOverride} CAD."
Set pricingSources to an empty array [].`
        : `PRICING RESEARCH: Using Google Search Grounding, research current and recently sold prices for this item.
Search currency-agnostically (do not restrict to CAD) to maximize available data, then convert the final price to CAD.
You MUST include 2 to 5 genuine, verifiable URLs from your Google Search Grounding to support your pricing rationale.
CRITICAL: Do NOT guess, reconstruct, or generate fake URL patterns. Only return exact URLs that you have actually found in your search results.
Provide a suggestedPriceCAD as a number (no currency symbol). Justify the price in pricingRationale.`;

    const userNotesInstruction =
        cluster.userNotes.trim().length > 0
            ? `USER NOTES (treat as high-priority contextual hints for identification and pricing):
"${cluster.userNotes}"`
            : `No user notes provided.`;

    const prompt = `You are an expert eBay reseller with deep knowledge of collectibles, electronics, toys, and vintage goods.
Analyze the provided product images carefully.

${userNotesInstruction}

TASK 1 — ITEM IDENTIFICATION:
Identify the item with precise detail: brand, model, edition/year, condition, notable features, completeness (is anything missing?).
Write your finding as a clear, factual plain-language paragraph in the "itemIdentity" field.

TASK 2 — PRICING:
${pricingInstruction}

TASK 3 — CONFIDENCE SCORES:
Rate your confidence in each dimension on a scale of 0–100 (integer):
- productDetection: How clearly can you identify the specific product from the images?
- pricing: How confident are you in the suggested price based on available market data?
- packaging: How well can you estimate packaging dimensions and weight from the images?
- condition: How clearly can you assess the item's condition from the images?

TASK 4 — CATALOG IDENTIFIERS:
For products that use standard catalog identifiers (books, music CDs/vinyl, movies/DVDs, video games, consumer electronics, boxed retail products), find the exact identifier for this specific product.

VERIFICATION STANDARD — THIS IS STRICT:
You must be able to state WHERE you found each identifier. Only two sources are acceptable:
  A) You read it directly from the product image (a barcode, an ISBN printed on the back cover, a part number on a label). Barcodes are fully readable from images — if one is visible, read every digit.
  B) You searched for it and the search result explicitly lists THIS exact product — matching title, author/artist/model, edition, region, and year. A result that "looks like" the same product is not sufficient.

DO NOT invent, estimate, or infer any identifier. A single wrong digit in an ISBN or UPC will cause eBay to link this listing to an entirely different product in their catalog — this is worse than having no identifier at all.

What to look for by product type:
- Books: ISBN-13 (preferred) or ISBN-10. Printed on the back cover and/or copyright page. If visible in image, read it. Otherwise search: "[exact title] [author] ISBN [year if known]".
- Music CDs / Vinyl / DVDs / Blu-rays / Video Games: UPC (12 digits) or EAN (13 digits). Printed as a barcode on the packaging. If the barcode is visible, read it digit by digit.
- Consumer electronics / hardware / tools / parts: MPN (Manufacturer Part Number) and Brand. Usually printed on a label or stamped on the product. Search: "[brand] [model name] MPN" if not visible.
- Retail boxed products (toys, games, appliances): UPC or EAN from the barcode on the box.

Set productIdentifiers to null if:
- The product is handmade, vintage pre-barcode era, custom, or one-of-a-kind
- The product type does not use catalog identifiers (loose clothing, artwork, raw collectibles, etc.)
- You cannot confirm an identifier through source A or source B above — a plausible guess is not acceptable

OUTPUT FORMAT:
Return a single, valid JSON object with this exact structure. Do not include any markdown fences or surrounding text.
{
  "itemIdentity": "string — precise plain-language description of the item",
  "pricingRationale": "string — paragraph explaining pricing logic and comparables",
  "pricingSources": ["url1", "url2", "..."],
  "suggestedPriceCAD": number_or_null,
  "confidenceScores": {
    "productDetection": integer_0_to_100,
    "pricing": integer_0_to_100,
    "packaging": integer_0_to_100,
    "condition": integer_0_to_100
  },
  "productIdentifiers": {
    "isbn": ["978-XXXXXXXXXX"],
    "upc": ["XXXXXXXXXXXX"],
    "ean": ["XXXXXXXXXXXXX"],
    "mpn": "exact-part-number",
    "brand": "Brand Name"
  }
}
Note: productIdentifiers should only include the fields that apply to this product. Omit fields you don't have. Set the entire productIdentifiers object to null if no identifiers could be verified.
`;

    let parsed: Step1Output | null = null;
    let attempts = 0;
    let lastError: unknown;
    let jsonRaw = "";

    while (attempts < 3 && !parsed) {
        attempts++;
        try {
            const response = await ai.models.generateContent({
                model: modelId,
                contents: [
                    {
                        role: "user",
                        parts: [
                            ...imageParts,
                            { text: prompt },
                        ],
                    },
                ],
                config: {
                    tools: [{ googleSearch: {} }],
                    maxOutputTokens: 8192,
                },
            });

            if (response.usageMetadata) {
                console.log(`[Step 1 Token Usage - Attempt ${attempts}] Prompt: ${response.usageMetadata.promptTokenCount} | Candidates: ${response.usageMetadata.candidatesTokenCount} | Total: ${response.usageMetadata.totalTokenCount}`);
            }

            const text = response.text ?? "";
            jsonRaw = text.slice(0, 400);

            // Strip markdown code block fences if present
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            let jsonStr = text;

            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            } else {
                // Defensive scan: if no fences, slice everything between the first { and last }
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = text.slice(firstBrace, lastBrace + 1);
                }
            }

            parsed = JSON.parse(jsonStr) as Step1Output;
        } catch (err) {
            lastError = err;
            console.warn(`[Step 1] Attempt ${attempts} failed or returned invalid JSON, retrying...`);
        }
    }

    if (!parsed) {
        throw new Error(`Step 1: Gemini returned invalid JSON after 3 attempts. Raw: ${jsonRaw}`);
    }

    // Enforce priceOverride logic: if override present, force suggestedPriceCAD to null
    if (hasPriceOverride) {
        parsed.suggestedPriceCAD = null;
    }

    return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a set of progressively shorter search queries from a full-text item
 * identity paragraph. eBay's taxonomy API works best with short (3–8 word)
 * queries — sending a whole paragraph often returns HTTP 204 (no results).
 * We try from shortest to longest, returning all unique non-empty candidates.
 */
function deriveEbayQueries(itemIdentity: string): string[] {
    const words = itemIdentity
        .split(/[.!?,;]/, 1)[0] // Take first sentence-like fragment
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0);

    const candidates = [
        words.slice(0, 5).join(" "),   // First 5 words — most effective for eBay
        words.slice(0, 8).join(" "),   // Slightly more context
        words.slice(0, 12).join(" "),  // First 12 words
        itemIdentity.slice(0, 120),    // Raw first 120 chars as final fallback
    ];

    // Deduplicate, preserve order, filter too-short strings
    const seen = new Set<string>();
    const result: string[] = [];
    for (const q of candidates) {
        const trimmed = q.trim();
        if (trimmed.length >= 3 && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    }
    return result;
}

async function runStep2(itemIdentity: string) {
    // Derive progressive query candidates — short queries work best for eBay taxonomy
    const queryAttempts = deriveEbayQueries(itemIdentity);

    let suggestions: import("@/lib/ebayService").CategorySuggestion[] = [];

    for (const query of queryAttempts) {
        suggestions = await getCategorySuggestions(query);
        if (suggestions.length > 0) {
            console.log(`[Step 2] Category suggestions found for query: "${query.slice(0, 80)}"`);
            break;
        }
        console.warn(`[Step 2] No category suggestions for query: "${query.slice(0, 80)}" — trying next fallback`);
    }

    if (suggestions.length === 0) {
        throw new Error(
            `Step 2: getCategorySuggestions returned no results for all query attempts. ` +
            `Item identity: "${itemIdentity.slice(0, 120)}"`
        );
    }

    // Primary category = top suggestion
    const ebayCategoryId = suggestions[0].categoryId;

    // Store top 3 suggestions for fallback (used by /api/summon on error 25604)
    const categorySuggestions = suggestions.slice(0, 3).map(s => ({
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        categoryTreeNodeLevel: s.categoryTreeNodeLevel,
    }));

    // Fetch the complete aspect schema for the primary category
    const requiredAspects = await getItemAspectsForCategory(ebayCategoryId);

    // Parse into strictly-typed schema format
    const aspectSchema = parseAspectSchema(requiredAspects);

    return { ebayCategoryId, categorySuggestions, requiredAspects, aspectSchema };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 implementation
// ─────────────────────────────────────────────────────────────────────────────

async function runStep3(params: {
    ai: GoogleGenAI;
    modelId: string;
    itemIdentity: string;
    userNotes: string;
    aspectSchema: ReturnType<typeof parseAspectSchema>; // Strictly typed
}): Promise<Step3Output> {
    const { ai, modelId, itemIdentity, userNotes, aspectSchema } = params;

    const userNotesSection =
        userNotes.trim().length > 0
            ? `USER NOTES (override or supplement any assumptions you make):
"${userNotes}"`
            : `No user notes provided.`;

    const simplifiedSchema = aspectSchema.map((a: ReturnType<typeof parseAspectSchema>[number]) => {
        let allowed = a.mode === "SELECTION_ONLY" ? a.allowedValues : undefined;
        if (allowed && allowed.length > 30) {
            allowed = [...allowed.slice(0, 30), "...(truncated)"];
        }
        return {
            aspectName: a.aspectName,
            mode: a.mode,
            cardinality: a.cardinality,
            allowedValues: allowed
        };
    });
    const aspectSchemaJson = JSON.stringify(simplifiedSchema);

    const prompt = `You are an expert eBay listing specialist. Your job is to write a compelling, complete eBay product listing.

ITEM IDENTITY (from visual analysis):
${itemIdentity}

${userNotesSection}

TASK 1 — ITEM SPECIFICS (itemSpecifics):
ASPECT COMPLETION RULES:
You will be given an array of aspect definitions. For each aspect, generate
a value following these rules strictly:

1. The JSON key MUST be the exact, verbatim "aspectName" string provided in the schema definition. Do not change the casing or phrasing. For example, if the schema says "aspectName": "Release Year", your JSON key must be "Release Year".

2. If mode is "SELECTION_ONLY" and allowedValues is non-empty:
   - You MUST choose a value that exists verbatim in the allowedValues array.
   - Do not invent values. Do not approximate. Exact match only.
   - If no value fits confidently, return null for that aspect.

3. If mode is "FREE_TEXT":
   - Generate a precise, accurate value based on the product information.

4. If cardinality is "MULTI":
   - Return a JSON array of values: ["value1", "value2"]
   - Each value must still respect the SELECTION_ONLY rule if applicable.

5. If cardinality is "SINGLE":
   - Return a single string value.

6. If you cannot determine a reliable value for any aspect:
   - Return null. Do not guess.

Output a JSON object where each key is the exact "aspectName" string and each
value follows the rules above. Null values should be omitted from the output.

ASPECT DEFINITIONS:
${aspectSchemaJson}

TASK 2 — TITLE:
CRITICAL: eBay titles have a HARD LIMIT of 80 characters. Your title MUST be 80 characters or fewer — count carefully. If you are near the limit, remove filler adjectives (great, amazing, perfect) first, then abbreviate common words (w/ for with). Front-load the most important keywords: brand, model, type, key features. Do not use ALL CAPS.

TASK 3 — DESCRIPTION:
Write a beautifully formatted HTML product description. Use <h2>, <ul>, <li>, <p>, and <strong> tags. Include: what the item is, key features, condition notes, what is included/excluded, and a compelling closing line.

TASK 4 — CONDITION:
Set "condition" to one of eBay's EXACT valid ConditionEnum values. You MUST use one of these exact strings:
- NEW — Brand new, unopened, in original packaging
- NEW_OTHER — New but may be missing original packaging
- NEW_WITH_DEFECTS — New but has defects (scuffs, missing buttons, etc.)
- LIKE_NEW — Opened but barely or never used
- USED_VERY_GOOD — Used with minimal wear, no obvious damage
- USED_GOOD — Used with minor external wear (scuffs, scratches)
- USED_ACCEPTABLE — Significant wear, heavy use, but functional
- FOR_PARTS_OR_NOT_WORKING — Not fully functional, for parts/repair
- SELLER_REFURBISHED — Restored to working order by seller
Do NOT invent condition codes. Do NOT use "USED_EXCELLENT" — it does not exist.
Write "conditionDescription" as a plain-text sentence visible to buyers (e.g., "Item shows light wear on corners. Fully functional.").
IMPORTANT: If condition is "NEW", set conditionDescription to an empty string "" — eBay rejects conditionDescription on new items.

TASK 5 — PACKAGING DIMENSIONS & WEIGHT:
Estimate realistic packaging dimensions (with enough padding/box) in inches and weight in pounds. These are used for shipping calculations, so be realistic.

OUTPUT FORMAT:
Return a single, valid JSON object with this exact structure. Do not include any markdown fences or surrounding text.
{
  "title": "string",
  "descriptionHtml": "string (valid HTML)",
  "condition": "string (valid eBay condition code)",
  "conditionDescription": "string",
  "itemSpecifics": { "Exact Aspect Name Here": "value", "Another Exact Aspect Name": ["value1", "value2"] },
  "dimensions": { "length": number, "width": number, "height": number, "unit": "in" },
  "weight": { "value": number, "unit": "lb" }
}`;

    let parsed: Step3Output | null = null;
    let attempts = 0;
    let lastError: unknown;

    while (attempts < 3 && !parsed) {
        attempts++;
        try {
            const response = await ai.models.generateContent({
                model: modelId,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    maxOutputTokens: 8192,
                },
            });

            if (response.usageMetadata) {
                console.log(`[Step 3 Token Usage - Attempt ${attempts}] Prompt: ${response.usageMetadata.promptTokenCount} | Candidates: ${response.usageMetadata.candidatesTokenCount} | Total: ${response.usageMetadata.totalTokenCount}`);
            }

            const text = response.text ?? "";
            parsed = JSON.parse(text) as Step3Output;
        } catch (e) {
            lastError = e;
            console.warn(`[Step 3] Attempt ${attempts} JSON parse failed, retrying...`);
        }
    }

    if (!parsed) {
        throw new Error(`Step 3: Gemini returned invalid JSON after 3 attempts. Error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }

    if (parsed.title && parsed.title.length > 80) {
        // AI-powered smart title shortener — preserves SEO keywords & readability
        try {
            const shortenResponse = await ai.models.generateContent({
                model: modelId,
                contents: [{ role: "user", parts: [{ text:
                    `This eBay listing title is ${parsed.title.length} characters, which exceeds the 80-character limit:\n"${parsed.title}"\n\nShorten it to UNDER 80 characters. Rules:\n- Keep: brand, model, key specs, condition keywords\n- Remove: filler words (great, amazing, excellent, perfect, brand new)\n- Abbreviate if needed (w/ for with, ft for feet)\n- Do NOT add quotes or formatting\n- Output ONLY the shortened title, nothing else` }] }],
                config: { maxOutputTokens: 256 },
            });
            const shortened = (shortenResponse.text ?? "").trim().replace(/^"|"$/g, "");
            if (shortened.length > 0 && shortened.length <= 80) {
                console.log(`[Step 3] AI shortened title: "${parsed.title}" (${parsed.title.length}) → "${shortened}" (${shortened.length})`);
                parsed.title = shortened;
            } else {
                console.warn(`[Step 3] AI shortener returned invalid length (${shortened.length}), using word-aware fallback`);
                parsed.title = wordAwareTruncate(parsed.title, 80);
            }
        } catch (e) {
            console.warn("[Step 3] AI title shortener failed, using word-aware fallback:", e);
            parsed.title = wordAwareTruncate(parsed.title, 80);
        }
    }

    // Clean and normalize the raw AI aspect specifics matching the exact constraint rules
    parsed.itemSpecifics = validateAndNormalizeAspects(parsed.itemSpecifics, aspectSchema);

    // Calculate connection score
    const populatedCount = Object.keys(parsed.itemSpecifics).length;
    const totalCount = Array.isArray(aspectSchema) ? aspectSchema.length : 0;
    parsed.aspectCompletionScore = totalCount > 0 ? Math.round((populatedCount / totalCount) * 100) : null;

    return parsed;
}


// ─────────────────────────────────────────────────────────────────────────────
// Step 3.5 implementation — Gap Fill with relaxed confidence rules
// ─────────────────────────────────────────────────────────────────────────────
//
// Session 23 change: relaxed the "100% certain or omit" anti-hallucination rule
// to "reasonable confidence — fill it". Categorical fields (color, type, era,
// country) now use best-call instead of null. Anti-hallucination still applies
// to factual specifics (part numbers, exact dimensions, precise measurements).

async function runStep3Point5(params: {
    ai: GoogleGenAI;
    modelId: string;
    itemIdentity: string;
    aspectSchema: ReturnType<typeof parseAspectSchema>;
    currentItemSpecifics: Record<string, string | string[]>;
}): Promise<Record<string, string | string[]>> {
    const { ai, modelId, itemIdentity, aspectSchema, currentItemSpecifics } = params;

    const emptyAspects: { aspectName: string; mode: string; cardinality: string; allowedValues?: string[] }[] = [];
    for (const aspect of aspectSchema) {
        const aspectName = aspect.aspectName;
        const val = currentItemSpecifics[aspectName];
        if (
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0)
        ) {
            let allowed = aspect.mode === "SELECTION_ONLY" ? aspect.allowedValues : undefined;
            if (allowed && allowed.length > 30) {
                allowed = [...allowed.slice(0, 30), "...(truncated)"];
            }
            emptyAspects.push({
                aspectName: aspect.aspectName,
                mode: aspect.mode,
                cardinality: aspect.cardinality,
                allowedValues: allowed,
            });
        }
    }

    if (emptyAspects.length === 0) {
        return currentItemSpecifics;
    }

    const prompt = `You are a precise product metadata specialist. You have been given a specific
identified product and a list of metadata fields that are still empty.

PRODUCT IDENTITY:
${itemIdentity}

YOUR TASK:
Fill in the missing metadata fields for this product using reasonable confidence.

FILLING GUIDELINES:
1. If you have a plausible, well-grounded answer based on the product identity,
   provide it. You do not need to be 100% certain.
2. Only omit aspects that are genuinely unknowable from the available product
   information (e.g. a warranty field where no warranty info is visible).
3. For SELECTION_ONLY fields: pick the most likely value from the allowedValues
   list even if not perfectly certain. If none fit well, pick the closest match.
4. For FREE_TEXT fields: provide your best estimate. Categorical fields (color,
   type, era, genre, country, format) → make your best call. Factual specifics
   (part numbers, exact serial numbers, precise measurements you cannot see) →
   only provide if you are genuinely certain.
5. For MULTI cardinality: return a JSON array ["value1", "value2"]. Each value
   must still respect the SELECTION_ONLY rule if applicable.
6. For SINGLE cardinality: return a single string value.
7. Null values must be omitted from the output entirely.

ANTI-HALLUCINATION (still applies to factual specifics):
Do not invent precise numbers, part numbers, or measurements you cannot derive
from the product information. For categorical descriptors, make your best call.

MISSING FIELDS:
${JSON.stringify(emptyAspects, null, 2)}

OUTPUT FORMAT:
Return a single valid JSON object where each key is the exact aspectName
string and each value follows the rules above. Omit null values entirely.
Do not include markdown fences or any surrounding text.`;

    let newAspects: Record<string, string | string[]> = {};
    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                maxOutputTokens: 8192,
            },
        });

        if (response.usageMetadata) {
            console.log(`[Step 3.5 Token Usage] Prompt: ${response.usageMetadata.promptTokenCount} | Candidates: ${response.usageMetadata.candidatesTokenCount} | Total: ${response.usageMetadata.totalTokenCount}`);
        }

        const text = response.text ?? "";

        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const firstBrace = text.indexOf("{");
            const lastBrace = text.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = text.slice(firstBrace, lastBrace + 1);
            }
        }

        newAspects = JSON.parse(jsonStr);
        newAspects = validateAndNormalizeAspects(newAspects, aspectSchema);
    } catch (e) {
        console.warn("Step 3.5 failed or returned invalid JSON, continuing without new fields.", e);
        return currentItemSpecifics;
    }

    const merged = { ...currentItemSpecifics };
    for (const key of Object.keys(newAspects)) {
        const oldVal = merged[key];
        const newVal = newAspects[key];

        const isOldEmpty =
            oldVal === undefined ||
            oldVal === null ||
            oldVal === "" ||
            (Array.isArray(oldVal) && oldVal.length === 0);

        if (isOldEmpty && newVal !== undefined && newVal !== null) {
            merged[key] = newVal;
        }
    }

    return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3.6 implementation — Required Aspects Targeted Self-Healing (Session 23)
// ─────────────────────────────────────────────────────────────────────────────
//
// Root cause: Step 3.5 (and Step 3) anti-hallucination rules cause Gemini to
// correctly refuse to guess required aspects. But eBay error 25719 rejects the
// entire inventory item if any required aspect is empty. This step uses a
// fundamentally different prompt philosophy: "You MUST provide a value.
// Returning nothing is not an option." Retries up to 3 times.

async function runStep3Point6(params: {
    ai: GoogleGenAI;
    modelId: string;
    itemIdentity: string;
    aspectSchema: ReturnType<typeof parseAspectSchema>;
    currentItemSpecifics: Record<string, string | string[]>;
}): Promise<Record<string, string | string[]>> {
    const { ai, modelId, itemIdentity, aspectSchema, currentItemSpecifics } = params;

    // Helper: find required aspects that are still empty
    function findEmptyRequiredAspects(
        specifics: Record<string, string | string[]>
    ): { aspectName: string; mode: string; cardinality: string; allowedValues?: string[] }[] {
        const empty = [];
        for (const aspect of aspectSchema) {
            if (!aspect.required) continue;
            const val = specifics[aspect.aspectName];
            if (
                val === undefined ||
                val === null ||
                val === "" ||
                (Array.isArray(val) && val.length === 0)
            ) {
                let allowed = aspect.mode === "SELECTION_ONLY" ? aspect.allowedValues : undefined;
                if (allowed && allowed.length > 30) {
                    allowed = [...allowed.slice(0, 30), "...(truncated)"];
                }
                empty.push({
                    aspectName: aspect.aspectName,
                    mode: aspect.mode,
                    cardinality: aspect.cardinality,
                    allowedValues: allowed,
                });
            }
        }
        return empty;
    }

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1000;

    const currentSpecifics = { ...currentItemSpecifics };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const emptyRequired = findEmptyRequiredAspects(currentSpecifics);

        // Fast path: all required aspects are filled
        if (emptyRequired.length === 0) {
            break;
        }

        console.log(`[Step 3.6] Attempt ${attempt}: ${emptyRequired.length} required aspect(s) still empty: ${emptyRequired.map(a => a.aspectName).join(", ")}`);

        const prompt = `You are an eBay listing specialist. The following aspects are REQUIRED by eBay.
The listing WILL BE REJECTED if any of them are missing. You MUST provide a value for each one.

PRODUCT IDENTITY:
${itemIdentity}

MANDATORY FILLING RULES:
1. You MUST provide a value for EVERY aspect listed below. Returning null or
   omitting a field is NOT an option for these required fields.
2. For SELECTION_ONLY aspects: choose the single most likely value from the
   allowedValues list. You do not need certainty — pick the best fit. If none
   fit perfectly, pick the closest one. You must pick something.
3. For FREE_TEXT aspects: provide your best estimate. An educated guess based
   on the product type, category, or general knowledge is acceptable and necessary.
4. For MULTI cardinality: return a JSON array with at least one value.
5. For SINGLE cardinality: return a single string value.
6. Every aspect key MUST be the exact, verbatim aspectName string — no changes
   to casing or phrasing.

REQUIRED ASPECTS (all must be filled):
${JSON.stringify(emptyRequired, null, 2)}

OUTPUT FORMAT:
Return a single valid JSON object. Every aspect listed above MUST have a value.
Do not include markdown fences or any surrounding text.`;

        try {
            const response = await ai.models.generateContent({
                model: modelId,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { maxOutputTokens: 4096 },
            });

            if (response.usageMetadata) {
                console.log(`[Step 3.6 Token Usage - Attempt ${attempt}] Prompt: ${response.usageMetadata.promptTokenCount} | Candidates: ${response.usageMetadata.candidatesTokenCount} | Total: ${response.usageMetadata.totalTokenCount}`);
            }

            const text = response.text ?? "";

            let jsonStr = text;
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            } else {
                const firstBrace = text.indexOf("{");
                const lastBrace = text.lastIndexOf("}");
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = text.slice(firstBrace, lastBrace + 1);
                }
            }

            let newAspects: Record<string, string | string[]> = JSON.parse(jsonStr);
            newAspects = validateAndNormalizeAspects(newAspects, aspectSchema);

            // Merge new values in — never overwrite existing
            for (const key of Object.keys(newAspects)) {
                const oldVal = currentSpecifics[key];
                const newVal = newAspects[key];
                const isOldEmpty =
                    oldVal === undefined ||
                    oldVal === null ||
                    oldVal === "" ||
                    (Array.isArray(oldVal) && oldVal.length === 0);
                if (isOldEmpty && newVal !== undefined && newVal !== null) {
                    currentSpecifics[key] = newVal;
                }
            }
        } catch (e) {
            console.warn(`[Step 3.6] Attempt ${attempt} failed or returned invalid JSON.`, e);
        }

        // If there are still empty required aspects and we have more attempts, wait and retry
        const stillEmpty = findEmptyRequiredAspects(currentSpecifics);
        if (stillEmpty.length === 0 || attempt === MAX_ATTEMPTS) {
            break;
        }
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    return currentSpecifics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3.7 implementation — Programmatic Absolute Fallback (Session 23)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pure TypeScript — no Gemini call. Deterministic and instantaneous.
// Guarantees that every required aspect has a value before the listing
// reaches summon. Logs every fallback at warn level for visibility.

function runStep3Point7(params: {
    aspectSchema: ReturnType<typeof parseAspectSchema>;
    currentItemSpecifics: Record<string, string | string[]>;
}): Record<string, string | string[]> {
    const { aspectSchema, currentItemSpecifics } = params;

    // Priority-ordered generic values to scan for in SELECTION_ONLY allowedValues
    const GENERIC_FALLBACK_VALUES = [
        "Does not apply",
        "Not Applicable",
        "Unknown",
        "Not Specified",
        "Other",
        "N/A",
        "Unbranded",
    ];

    const result = { ...currentItemSpecifics };

    for (const aspect of aspectSchema) {
        if (!aspect.required) continue;

        const val = result[aspect.aspectName];
        const isEmpty =
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0);

        if (!isEmpty) continue;

        let fallbackValue: string;

        if (aspect.mode === "SELECTION_ONLY" && aspect.allowedValues.length > 0) {
            // Scan allowedValues (case-insensitive) for known generic values in priority order
            const lowerAllowed = aspect.allowedValues.map(v => v.toLowerCase());
            let found: string | null = null;

            for (const generic of GENERIC_FALLBACK_VALUES) {
                const idx = lowerAllowed.indexOf(generic.toLowerCase());
                if (idx !== -1) {
                    found = aspect.allowedValues[idx];
                    break;
                }
            }

            // If no generic value found, use the first available value in the list
            fallbackValue = found ?? aspect.allowedValues[0];
        } else {
            // FREE_TEXT or SELECTION_ONLY with no allowedValues
            fallbackValue = "Not Specified";
        }

        result[aspect.aspectName] = fallbackValue;
        console.warn(
            `[Step 3.7 Fallback] aspectName="${aspect.aspectName}" → used generic fallback "${fallbackValue}"`
        );
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Offer Calculation
// ─────────────────────────────────────────────────────────────────────────────
//
// bestOfferEligible is unconditionally set to true here.
// Actual category ineligibility is detected at submission time in Phase 6:
// if eBay rejects bestOfferTerms, the /api/summon route catches the error,
// sets bestOfferEligible: false, acceptOffers: false, autoAcceptPriceCAD: null
// on that listing, and retries the offer without bestOfferTerms.
//
// autoAcceptPriceCAD formula:
//   autoAcceptThreshold is a percentage discount from the listed price (0–100).
//   e.g. finalPriceCAD = $100, autoAcceptThreshold = 10 (meaning 10% below price)
//   → autoAcceptPriceCAD = $100 * (1 - 10/100) = $90
//   This value must always be strictly lower than finalPriceCAD (eBay requirement).

function runStep4(params: {
    priceOverride: number | null;
    suggestedPriceCAD: number | null;
    globalPrefs: {
        acceptOffers: boolean;
        autoAcceptThreshold: number | null;
    };
}): {
    finalPriceCAD: number;
    acceptOffers: boolean;
    autoAcceptPriceCAD: number | null;
    bestOfferEligible: boolean;
} {
    const { priceOverride, suggestedPriceCAD, globalPrefs } = params;

    // priceOverride takes absolute precedence over AI-suggested price.
    // Floor at $0.99 — eBay rejects $0.00 offers and a zero price means Gemini
    // failed to suggest one AND no override was set. $0.99 is a safe minimum
    // that the user will see during review and can override.
    const rawPrice = priceOverride ?? suggestedPriceCAD ?? 0;
    const finalPriceCAD = Math.max(rawPrice, 0.99);

    // Inherit the global acceptOffers preference
    const acceptOffers = globalPrefs.acceptOffers;

    // Auto-accept threshold: a percentage discount from the listing price.
    //   autoAcceptThreshold = 10 means "auto-accept any offer within 10% of the price"
    //   → threshold = finalPriceCAD * (1 - autoAcceptThreshold / 100)
    // Per EBAY_API_GUIDELINES.md §11, autoAcceptPrice.value must be strictly
    // lower than pricingSummary.price.value — this formula guarantees it.
    let autoAcceptPriceCAD: number | null = null;
    if (
        acceptOffers &&
        globalPrefs.autoAcceptThreshold !== null &&
        globalPrefs.autoAcceptThreshold > 0 &&
        finalPriceCAD > 0
    ) {
        autoAcceptPriceCAD =
            Math.round(finalPriceCAD * (1 - globalPrefs.autoAcceptThreshold / 100) * 100) / 100;
    }

    // bestOfferEligible is always true at pipeline time.
    // Phase 6 (/api/summon) will flip it to false if eBay rejects Best Offer for this category.
    const bestOfferEligible = true;

    return { finalPriceCAD, acceptOffers, autoAcceptPriceCAD, bestOfferEligible };
}
