"use client";

/**
 * Materia Magical Staff — Gallery State Store
 *
 * Pure React Context + useState. No Zustand, no Redux, no external deps.
 * All cluster mutation logic is co-located here.
 *
 * The `extractPriceOverride()` function is exported as a pure function
 * so it can be unit tested by Vitest without any component rendering.
 */

import {
    createContext,
    useContext,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import type { ImageItem, Cluster, ListingObject } from "@/types";


// ── Price Extraction ────────────────────────────────────────────────────────

/**
 * Extracts a CAD price override value from a free-text notes string.
 *
 * Matches any of these patterns (case-insensitive):
 *   "$35"        → 35
 *   "35$"        → 35
 *   "$35.50"     → 35.50
 *   "40 CAD"     → 40
 *   "$40 CAD"    → 40
 *   "50 dollars" → 50
 *   "50 dollar"  → 50
 *   "50 bucks"   → null  (no supported currency indicator)
 *   "mint"       → null
 *   ""           → null
 *   "$120 firm"  → 120   (price embedded in longer string)
 *
 * The price may appear anywhere in the string.
 *
 * @param notes - The raw user-entered notes string.
 * @returns The price as a float, or null if no pattern was found.
 */
export function extractPriceOverride(notes: string): number | null {
    if (!notes || notes.trim() === "") return null;

    // Pattern 1: dollar-sign prefix  → $35  or  $35.50
    const prefixMatch = notes.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    if (prefixMatch) {
        const value = parseFloat(prefixMatch[1]);
        return isNaN(value) ? null : value;
    }

    // Pattern 2: suffix patterns → 35$  |  40 CAD  |  50 dollars
    const suffixMatch = notes.match(
        /(\d+(?:\.\d{1,2})?)\s*(?:\$|CAD|dollars?)/i
    );
    if (suffixMatch) {
        const value = parseFloat(suffixMatch[1]);
        return isNaN(value) ? null : value;
    }

    return null;
}

// ── Context Shape ────────────────────────────────────────────────────────────

interface GalleryState {
    /** Ungrouped images — not yet part of any cluster */
    images: ImageItem[];
    /** All active clusters */
    clusters: Cluster[];
    /** Fully processed ListingObjects from the AI pipeline */
    listings: ListingObject[];
    /**
     * Add newly uploaded images to the ungrouped pool.
     * Called by UploadZone after /api/upload returns.
     * Normalizes items: ensures userNotes and priceOverride are initialized.
     */
    addImages: (items: ImageItem[]) => void;
    /**
     * Update the notes for a single ungrouped image. Re-runs price extraction.
     * Mirrors updateNotes() for clusters.
     */
    updateImageNotes: (imageId: string, notes: string) => void;
    /**
     * Create a new cluster from two ungrouped images.
     * The target image (drop target) becomes the first image / default main.
     */
    createClusterFromImages: (sourceId: string, targetId: string) => void;
    /**
     * Add an ungrouped image into an existing cluster.
     */
    mergeImageIntoCluster: (imageId: string, clusterId: string) => void;
    /**
     * Change the main image within a cluster (crown re-designation).
     */
    setMainImage: (clusterId: string, imageId: string) => void;
    /**
     * Update the notes for a cluster. Re-runs price extraction automatically.
     */
    updateNotes: (clusterId: string, notes: string) => void;
    /**
     * Eject a single image from a cluster back to the ungrouped pool.
     * If the cluster becomes empty after ejection, it is dissolved.
     * If the ejected image was the main image, mainImageId shifts to images[0].
     */
    removeImageFromCluster: (clusterId: string, imageId: string) => void;
    /**
     * Remove an ungrouped image from the gallery entirely.
     */
    removeImage: (imageId: string) => void;
    /**
     * Delete an entire cluster. All its images return to the ungrouped pool.
     */
    removeCluster: (clusterId: string) => void;
    /**
     * Store the processed ListingObjects returned by the AI pipeline.
     * Called by ProcessingScreen when the batch completes.
     */
    setListings: (listings: ListingObject[]) => void;
    /**
     * Partially update a single ListingObject in the listings array.
     * Called by ListingCard on every inline field edit.
     * Also used by the "Dig Deeper" flow to replace a listing entirely.
     */
    updateListing: (id: string, updates: Partial<ListingObject>) => void;
}

const GalleryContext = createContext<GalleryState | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function GalleryProvider({ children }: { children: ReactNode }) {
    const [images, setImages] = useState<ImageItem[]>([]);
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [listings, setListings] = useState<ListingObject[]>([]);

    // ── Add uploaded images ────────────────────────────────────────────────
    const addImages = useCallback((items: ImageItem[]) => {
        // Normalize: /api/upload only returns {id, url, filename}.
        // Ensure the two client-side fields always have sane defaults.
        const normalized = items.map(item => ({
            ...item,
            userNotes: item.userNotes ?? "",
            priceOverride: item.priceOverride ?? null,
        }));
        setImages(prev => [...prev, ...normalized]);
    }, []);

    // ── Create cluster from two ungrouped images ───────────────────────────
    const createClusterFromImages = useCallback(
        (sourceId: string, targetId: string) => {
            const source = images.find(i => i.id === sourceId);
            const target = images.find(i => i.id === targetId);
            if (!source || !target) return;

            const newCluster: Cluster = {
                id: globalThis.crypto.randomUUID(),
                // Target is first (it was the drop target = becomes main by default)
                images: [target, source],
                mainImageId: target.id,
                userNotes: "",
                priceOverride: null,
            };

            setClusters(c => [...c, newCluster]);
            // Remove both images from ungrouped pool
            setImages(prev => prev.filter(i => i.id !== sourceId && i.id !== targetId));
        },
        [images]
    );

    // ── Merge ungrouped image into existing cluster ────────────────────────
    const mergeImageIntoCluster = useCallback(
        (imageId: string, clusterId: string) => {
            const imageToAdd = images.find(i => i.id === imageId);
            if (!imageToAdd) return;

            setClusters(prev =>
                prev.map(c =>
                    c.id === clusterId
                        ? { ...c, images: [...c.images, imageToAdd] }
                        : c
                )
            );
            setImages(prev => prev.filter(i => i.id !== imageId));
        },
        [images]
    );

    // ── Set main image (crown) ─────────────────────────────────────────────
    const setMainImage = useCallback((clusterId: string, imageId: string) => {
        setClusters(prev =>
            prev.map(c =>
                c.id === clusterId ? { ...c, mainImageId: imageId } : c
            )
        );
    }, []);

    // ── Update notes + re-parse price (clusters) ───────────────────────────
    const updateNotes = useCallback((clusterId: string, notes: string) => {
        setClusters(prev =>
            prev.map(c =>
                c.id === clusterId
                    ? {
                        ...c,
                        userNotes: notes,
                        priceOverride: extractPriceOverride(notes),
                    }
                    : c
            )
        );
    }, []);

    // ── Update notes + re-parse price (ungrouped images) ──────────────────
    const updateImageNotes = useCallback((imageId: string, notes: string) => {
        setImages(prev =>
            prev.map(img =>
                img.id === imageId
                    ? {
                        ...img,
                        userNotes: notes,
                        priceOverride: extractPriceOverride(notes),
                    }
                    : img
            )
        );
    }, []);

    // ── Eject image from cluster ───────────────────────────────────────────
    const removeImageFromCluster = useCallback(
        (clusterId: string, imageId: string) => {
            const cluster = clusters.find(c => c.id === clusterId);
            if (!cluster) return;

            const ejectedImage = cluster.images.find(i => i.id === imageId);
            if (!ejectedImage) return;

            setClusters(prev => {
                const c = prev.find(x => x.id === clusterId);
                if (!c) return prev;

                const remaining = c.images.filter(i => i.id !== imageId);

                if (remaining.length === 0) {
                    // Cluster dissolves — ejectedImage will be returned to pool below
                    return prev.filter(x => x.id !== clusterId);
                }

                // Shift mainImageId if the main was ejected
                const newMainId =
                    c.mainImageId === imageId
                        ? remaining[0].id
                        : c.mainImageId;

                return prev.map(x =>
                    x.id === clusterId
                        ? { ...x, images: remaining, mainImageId: newMainId }
                        : x
                );
            });

            // After clusters state has been updated, return the image to the pool.
            // React batches these in the same render cycle so no flash occurs.
            setImages(pool => [...pool, ejectedImage]);
        },
        [clusters]
    );

    // ── Remove ungrouped image ─────────────────────────────────────────────
    const removeImage = useCallback((imageId: string) => {
        setImages(prev => prev.filter(i => i.id !== imageId));
    }, []);

    // ── Remove entire cluster ──────────────────────────────────────────────
    const removeCluster = useCallback((clusterId: string) => {
        const cluster = clusters.find(c => c.id === clusterId);
        if (cluster) {
            setImages(pool => [...pool, ...cluster.images]);
        }
        setClusters(prev => prev.filter(c => c.id !== clusterId));
    }, [clusters]);

    // ── Update a single listing ────────────────────────────────────────────
    const updateListing = useCallback(
        (id: string, updates: Partial<ListingObject>) => {
            setListings(prev =>
                prev.map(l =>
                    l.id === id ? { ...l, ...updates } : l
                )
            );
        },
        []
    );

    return (
        <GalleryContext.Provider
            value={{
                images,
                clusters,
                listings,
                addImages,
                createClusterFromImages,
                mergeImageIntoCluster,
                setMainImage,
                updateNotes,
                updateImageNotes,
                removeImageFromCluster,
                removeImage,
                removeCluster,
                setListings,
                updateListing,
            }}
        >
            {children}
        </GalleryContext.Provider>
    );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGallery(): GalleryState {
    const ctx = useContext(GalleryContext);
    if (!ctx) {
        throw new Error("useGallery must be used inside <GalleryProvider>");
    }
    return ctx;
}
