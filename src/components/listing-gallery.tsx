"use client";

/**
 * Materia Magical Staff — Listing Gallery
 *
 * The main grid that orchestrates all drag-and-drop interactions between
 * ungrouped images and clusters. This component owns ALL drag state via refs
 * and delegates rendering to UngroupedImageCard and ItemCluster.
 *
 * D&D Rules (enforced here):
 *   - Ungrouped image → Ungrouped image:  createClusterFromImages()
 *   - Ungrouped image → Cluster:          mergeImageIntoCluster()
 *   - Cluster         → Anything:         BLOCKED (no merge, red flash)
 *
 * No D&D library is used — native HTML5 Drag-and-Drop API only.
 */

import { useRef, useState, useCallback, type DragEvent } from "react";
import { useGallery } from "@/lib/gallery-store";
import { UngroupedImageCard } from "@/components/ungrouped-image-card";
import { ItemCluster } from "@/components/item-cluster";

// What is currently being dragged
type DragPayload =
    | { type: "image"; id: string }
    | { type: "cluster"; id: string };

export function ListingGallery() {
    const {
        images,
        clusters,
        createClusterFromImages,
        mergeImageIntoCluster,
        removeImage,
    } = useGallery();

    // Track what's currently being dragged
    const dragging = useRef<DragPayload | null>(null);

    // Track which cluster ID should flash red (blocked drop attempt)
    const [blockedClusterId, setBlockedClusterId] = useState<string | null>(null);

    // ── Drag start ────────────────────────────────────────────────────────────
    const onImageDragStart = useCallback((e: DragEvent, imageId: string) => {
        dragging.current = { type: "image", id: imageId };
        e.dataTransfer.effectAllowed = "move";
        // Store the payload so drop targets can inspect it
        e.dataTransfer.setData("application/materia-type", "image");
        e.dataTransfer.setData("application/materia-id", imageId);
    }, []);

    // ── Generic drag over (prevent default to allow drop) ─────────────────
    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }, []);

    // ── Drop on ungrouped image card ──────────────────────────────────────
    const onDropOnImage = useCallback(
        (e: DragEvent, targetImageId: string) => {
            e.preventDefault();
            e.stopPropagation();

            const payload = dragging.current;
            dragging.current = null;

            if (!payload) return;

            if (payload.type === "image") {
                if (payload.id === targetImageId) return; // same card, skip
                createClusterFromImages(payload.id, targetImageId);
            }
            // Dropping a cluster on an image = blocked (same as cluster-on-cluster)
            // Just ignore.
        },
        [createClusterFromImages]
    );

    // ── Drop on cluster card ──────────────────────────────────────────────
    const onDropOnCluster = useCallback(
        (e: DragEvent, targetClusterId: string) => {
            e.preventDefault();
            e.stopPropagation();

            const payload = dragging.current;
            dragging.current = null;

            if (!payload) return;

            if (payload.type === "image") {
                mergeImageIntoCluster(payload.id, targetClusterId);
            } else if (payload.type === "cluster") {
                // BLOCKED — show red flash
                setBlockedClusterId(targetClusterId);
                setTimeout(() => setBlockedClusterId(null), 600);
            }
        },
        [mergeImageIntoCluster]
    );

    // ── Empty state ───────────────────────────────────────────────────────
    const isEmpty = images.length === 0 && clusters.length === 0;
    if (isEmpty) return null;

    return (
        <div className="pixel-border" style={{ padding: "2rem", marginTop: "2rem", minHeight: "80vh", boxSizing: "border-box", maxWidth: "100%" }}>
            {/* ── Section header ────────────────────────────────────────── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 16,
                    marginBottom: "1.5rem",
                }}
            >
                <h2 className="retro-title" style={{ fontSize: 11 }}>
                    GALLERY
                </h2>
                {images.length > 0 && (
                    <span
                        className="retro-body-text"
                        style={{ color: "var(--retro-muted)", fontSize: 16 }}
                    >
                        {images.length} UNGROUPED · {clusters.length} CLUSTER
                        {clusters.length !== 1 ? "S" : ""}
                    </span>
                )}
                {images.length === 0 && clusters.length > 0 && (
                    <span
                        className="retro-body-text"
                        style={{ color: "var(--retro-green)", fontSize: 16 }}
                    >
                        ✔ {clusters.length} CLUSTER
                        {clusters.length !== 1 ? "S" : ""} READY
                    </span>
                )}
            </div>

            {/* ── Drag hint (when ungrouped images exist) ───────────────── */}
            {images.length > 1 && (
                <div
                    className="retro-body-text"
                    style={{
                        color: "var(--retro-muted)",
                        fontSize: 14,
                        marginBottom: "1rem",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span style={{ color: "var(--retro-yellow)" }}>⠿</span>
                    DRAG AN IMAGE ONTO ANOTHER IMAGE TO GROUP THEM INTO ONE
                    LISTING
                </div>
            )}

            {/* ── Clusters ──────────────────────────────────────────────── */}
            {clusters.length > 0 && (
                <div style={{ marginBottom: "2rem" }}>
                    <div className="gallery-grid-clusters">
                        {clusters.map((cluster, i) => (
                            <ItemCluster
                                key={cluster.id}
                                cluster={cluster}
                                index={i}
                                onDragOver={onDragOver}
                                onDrop={onDropOnCluster}
                                blockedFlash={blockedClusterId === cluster.id}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Ungrouped Images ──────────────────────────────────────── */}
            {images.length > 0 && (
                <div>
                    {clusters.length > 0 && (
                        <h3
                            className="retro-subtitle"
                            style={{ marginBottom: "1rem" }}
                        >
                            UNGROUPED IMAGES
                        </h3>
                    )}
                    <div className="gallery-grid-images">
                        {images.map(img => (
                            <UngroupedImageCard
                                key={img.id}
                                image={img}
                                onDragStart={onImageDragStart}
                                onDragOver={onDragOver}
                                onDrop={onDropOnImage}
                                onRemove={removeImage}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
