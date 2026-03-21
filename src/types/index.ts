/**
 * Materia Magical Staff — Core Data Contract
 *
 * The ListingObject is the single source of truth for every item in the
 * pipeline. Every stage (ingestion, AI analysis, eBay taxonomy, final
 * assembly, publishing) reads from and writes to this interface. Do not
 * change the shape of this interface without updating all consumers.
 */

import { AspectSchema } from "./aspectSchema";

// ── Catalog Identifier Types ────────────────────────────────────────────────

/**
 * Verified catalog identifiers extracted by Gemini in Step 1.
 * Only populated for products where Gemini could verify the identifier by
 * reading it directly from the product image OR confirming it through a
 * grounded search result that explicitly matches this exact product
 * (title + edition + region + year). Never guessed or inferred.
 *
 * Included in the eBay inventory item payload so catalog-required categories
 * (Books, Music, Video Games, etc.) can match to eBay's product catalog,
 * resolving error 25604 "Product not found" at publishOffer time.
 */
export interface ProductIdentifiers {
    /** ISBN-10 or ISBN-13 for books. Exact edition only. */
    isbn?: string[];
    /** 12-digit UPC for retail products. */
    upc?: string[];
    /** 13-digit EAN for retail products. */
    ean?: string[];
    /** Manufacturer Part Number for electronics / hardware / parts. Requires brand. */
    mpn?: string;
    /** Brand name. Used alongside mpn for catalog matching. */
    brand?: string;
}

// ── Phase 3: Gallery / Ingestion Types ─────────────────────────────────────

/**
 * A single uploaded image. Created by the /api/upload endpoint.
 * Multiple ImageItems can be grouped into one Cluster.
 */
export interface ImageItem {
    /** UUID assigned at upload time */
    id: string;
    /** Public-facing URL: /uploads/{uuid}.{ext} */
    url: string;
    /** Filename as stored on disk: {uuid}.{ext} */
    filename: string;
    /**
     * Free-text context entered by the user before analysis.
     * Passed verbatim to the AI pipeline as high-priority context
     * (size, edition, condition, price, etc.).
     * Mirrors Cluster.userNotes — single-image products get the same field.
     */
    userNotes: string;
    /**
     * Parsed from userNotes when a price pattern is detected (e.g. "$35", "40 CAD").
     * When non-null, AI pricing is bypassed and this value becomes the final price.
     * Mirrors Cluster.priceOverride.
     */
    priceOverride: number | null;
}

/**
 * A Cluster represents exactly one real-world product.
 * One or more images belong to a cluster.
 * A cluster will become one ListingObject when the pipeline runs.
 *
 * Clustering rules (enforced in gallery-store.ts):
 *   - A cluster cannot be merged into another cluster.
 *   - Merging two ungrouped images creates a new cluster.
 *   - Dragging a single ungrouped image onto a cluster adds it to that cluster.
 *   - The mainImageId may be changed at any time by the user (crown designation).
 */
export interface Cluster {
    /** UUID for this cluster */
    id: string;
    /** All images belonging to this cluster, in display order */
    images: ImageItem[];
    /**
     * The id of the primary eBay listing image.
     * Always references an id present in `images`.
     * Defaults to images[0].id when cluster is created.
     */
    mainImageId: string;
    /** Free-text from the per-cluster notes field */
    userNotes: string;
    /**
     * Parsed from userNotes when a price pattern is detected.
     * When non-null, this value is the immutable final listing price.
     * AI pricing is completely bypassed for this cluster.
     * Patterns: "$35", "35$", "$35.50", "40 CAD", "$40 CAD", "50 dollars"
     */
    priceOverride: number | null;
}

export interface ListingObject {
    /** Generated UUID, created at ingestion time */
    id: string;

    /** Tracks the item through the pipeline */
    status: "pending" | "processing" | "reviewed" | "submitted" | "failed";

    // ── Raw Inputs ──────────────────────────────────────────────────────────

    /** Public-facing URLs of the form https://{domain}/uploads/{filename}, in order */
    imageUrls: string[];

    /** User-designated main eBay image, or first image by default */
    mainImageUrl: string;

    /** Free text from the per-cluster input field */
    userNotes: string;

    /**
     * Parsed from userNotes when a price pattern is found (e.g. "$35", "40 CAD").
     * When set, this value is the immutable final price and ALL AI pricing is skipped.
     */
    priceOverride: number | null;

    // ── Gemini Outputs — Phase 4 Step 1: Vision + Search Grounding ─────────

    /** Gemini's plain-language item description (brand, model, era, condition) */
    itemIdentity: string;

    /**
     * Verified catalog identifiers found by Gemini in Step 1 (Session 25).
     * Null when the product type has no catalog identifiers, or when none
     * could be confirmed through image reading or grounded search.
     * Passed through to eBay's inventory item product.isbn/upc/ean/mpn/brand
     * to enable catalog matching and prevent error 25604 at publishOffer time.
     */
    productIdentifiers: ProductIdentifiers | null;

    /** Paragraph explaining the pricing logic and comparables found */
    pricingRationale: string;

    /**
     * Real, clickable source URLs (minimum 8) from eBay sold, eBay active,
     * and other verifiable resale sources. Zero hallucination policy.
     */
    pricingSources: string[];

    /** Final converted CAD price. Null when priceOverride is active. */
    suggestedPriceCAD: number | null;

    /** Self-assessed confidence scores, 0–100 integers */
    confidenceScores: {
        /** How confidently the item was visually identified */
        productDetection: number;
        /** Confidence in the pricing estimate */
        pricing: number;
        /** Confidence in packaging dimension estimates */
        packaging: number;
        /** Confidence in condition assessment */
        condition: number;
    };

    // ── eBay API Outputs — Phase 4 Step 2: Taxonomy ────────────────────────

    /** Leaf category ID from getCategorySuggestions (top suggestion) */
    ebayCategoryId: string;

    /**
     * Top 3 category suggestions from getCategorySuggestions, stored in confidence order.
     * Used as fallback categories in /api/summon when publishOffer fails with error 25604
     * (catalog-match failure). The summon route iterates these and retries with each
     * alternative category before giving up.
     */
    categorySuggestions: Array<{
        categoryId: string;
        categoryName: string;
        categoryTreeNodeLevel: number;
    }>;

    /** Raw response from getItemAspectsForCategory — used in Step 3 assembly prompt */
    requiredAspects: object;

    /** Parsed strictly-typed schema governing aspect constraints and allowed values */
    aspectSchema: AspectSchema;

    /** defaults to true, overridden to false by Phase 6 if eBay rejects Best Offer for this category at submission time */
    bestOfferEligible: boolean;

    // ── Gemini Outputs — Phase 4 Step 3: Final Assembly ────────────────────

    /** Compelling, search-optimized eBay title */
    title: string;

    /** Beautifully formatted HTML product description */
    descriptionHtml: string;

    /**
     * eBay condition code — must map to a valid condition for the category
     * (e.g. "NEW", "USED_EXCELLENT", "USED_GOOD")
     */
    condition: string;

    /** Plain-text condition description, visible to buyers */
    conditionDescription: string;

    /**
     * All required and relevant item specifics.
     * Values for SELECTION_ONLY aspects must come from the allowed values list
     * in requiredAspects — never invented.
     */
    itemSpecifics: Record<string, string | string[]>;

    /** 0–100 percentage of how many aspect definitions were populated */
    aspectCompletionScore: number | null;

    /** Estimated packaging dimensions for shipping calculation */
    dimensions: {
        length: number;
        width: number;
        height: number;
        unit: "in" | "cm";
    };

    /** Estimated shipping weight */
    weight: {
        value: number;
        unit: "lb" | "kg" | "oz" | "g";
    };

    // ── Offer Settings ──────────────────────────────────────────────────────

    /** priceOverride if set, otherwise suggestedPriceCAD */
    finalPriceCAD: number;

    /** Per-item toggle — inherits from global default, overridable */
    acceptOffers: boolean;

    /** Auto-accept price in CAD. Null if acceptOffers is false or no threshold set. */
    autoAcceptPriceCAD: number | null;

    // ── Publishing ──────────────────────────────────────────────────────────

    /** Format: MM-{timestamp}-{index} */
    sku: string;

    /** Raw response from bulkCreateOrReplaceInventoryItem for this item */
    ebayInventoryItemResponse: object | null;

    /** Raw response from bulkCreateOffer (or createOffer fallback) for this item */
    ebayOfferResponse: object | null;

    /**
     * Full eBay error object if publishing failed.
     * Shape: { errorId, domain, category, message, longMessage, parameters }
     */
    ebayError: object | null;
}
