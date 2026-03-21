"use client";

/**
 * Materia Magical Staff — Item Cluster Card
 *
 * Renders a single cluster (one real-world product) as a rich card:
 *   - Horizontal image strip with thumbnails
 *   - Crown (★) button per thumbnail to set main image
 *   - Eject (✕) button per thumbnail to return image to ungrouped pool
 *   - MAIN IMAGE badge on the designated primary image
 *   - Drop zone for additional ungrouped images
 *   - Notes textarea with live price-pattern detection
 *   - Price override indicator banner (green) when priceOverride is active
 *
 * Drag behavior:
 *   - This card is a valid DROP TARGET for ungrouped images (not for clusters).
 *   - "Cluster-onto-cluster" drops are blocked in ListingGallery and will cause
 *     a brief red flash on this card.
 */

import { useState, type DragEvent } from "react";
import type { Cluster } from "@/types";
import { useGallery } from "@/lib/gallery-store";

interface ItemClusterProps {
    cluster: Cluster;
    index: number;
    /** Called by ListingGallery to handle D&D onto this cluster */
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent, clusterId: string) => void;
    /** Signal from ListingGallery that a cluster-onto-cluster drop was attempted */
    blockedFlash: boolean;
}

export function ItemCluster({
    cluster,
    index,
    onDragOver,
    onDrop,
    blockedFlash,
}: ItemClusterProps) {
    const { setMainImage, updateNotes, removeImageFromCluster, removeCluster } =
        useGallery();
    const [isDragTarget, setIsDragTarget] = useState(false);

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        setIsDragTarget(true);
        onDragOver(e);
    };

    const handleDragLeave = () => setIsDragTarget(false);

    const handleDrop = (e: DragEvent) => {
        setIsDragTarget(false);
        onDrop(e, cluster.id);
    };

    return (
        <div
            className={[
                "cluster-card",
                "pixel-border",
                isDragTarget ? "cluster-card-target" : "",
                blockedFlash ? "cluster-card-blocked" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="cluster-card-header">
                <span className="retro-subtitle" style={{ fontSize: 9 }}>
                    ITEM #{String(index + 1).padStart(3, "0")}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                    {cluster.priceOverride !== null && (
                        <span
                            className="retro-body-text"
                            style={{ fontSize: 12, color: "var(--retro-green)" }}
                        >
                            ★ ${cluster.priceOverride.toFixed(2)}
                        </span>
                    )}
                    <button
                        className="pixel-btn pixel-btn-sm pixel-btn-danger"
                        style={{ fontSize: 7, padding: "4px 8px" }}
                        onClick={() => removeCluster(cluster.id)}
                        aria-label="Delete cluster"
                        title="Delete this cluster (images return to pool)"
                    >
                        ✕ DELETE
                    </button>
                </div>
            </div>

            {/* ── Image Strip ─────────────────────────────────────────────── */}
            <div className="cluster-image-strip">
                {cluster.images.map(img => {
                    const isMain = img.id === cluster.mainImageId;
                    return (
                        <div
                            key={img.id}
                            className={`cluster-thumb${isMain ? " cluster-thumb-main" : ""}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={img.url}
                                alt={img.filename}
                                draggable={false}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    display: "block",
                                }}
                            />

                            {/* Main Image Badge */}
                            {isMain && (
                                <div className="main-image-badge">MAIN</div>
                            )}

                            {/* Crown / Set Main button */}
                            {!isMain && (
                                <button
                                    className="crown-btn"
                                    onClick={() =>
                                        setMainImage(cluster.id, img.id)
                                    }
                                    title="Set as main listing image"
                                    aria-label="Set as main image"
                                >
                                    ★
                                </button>
                            )}

                            {/* Eject button */}
                            <button
                                className="thumb-eject-btn"
                                onClick={() =>
                                    removeImageFromCluster(cluster.id, img.id)
                                }
                                title="Remove from cluster"
                                aria-label="Remove image from cluster"
                            >
                                ✕
                            </button>
                        </div>
                    );
                })}

                {/* Drop hint when drag is active over this cluster */}
                {isDragTarget && (
                    <div className="cluster-drop-hint">
                        <span className="retro-body-text" style={{ fontSize: 14, color: "var(--retro-yellow)" }}>
                            + ADD TO CLUSTER
                        </span>
                    </div>
                )}
            </div>

            {/* ── Price Override Banner ────────────────────────────────────── */}
            {cluster.priceOverride !== null && (
                <div className="price-override-banner">
                    <span style={{ marginRight: 6 }}>★</span>
                    PRICE LOCKED: ${cluster.priceOverride.toFixed(2)} CAD
                    <span style={{ marginLeft: 6, color: "var(--retro-muted)", fontSize: 10 }}>
                        — AI PRICING BYPASSED
                    </span>
                </div>
            )}

            {/* ── Notes Field ─────────────────────────────────────────────── */}
            <div style={{ padding: "12px 14px 14px" }}>
                <label
                    className="retro-label"
                    htmlFor={`notes-${cluster.id}`}
                    style={{ marginBottom: 6 }}
                >
                    NOTES
                    {cluster.priceOverride !== null && (
                        <span
                            className="retro-body-text"
                            style={{ color: "var(--retro-green)", marginLeft: 8, fontSize: 12 }}
                        >
                            (PRICE DETECTED)
                        </span>
                    )}
                </label>
                <textarea
                    id={`notes-${cluster.id}`}
                    className="pixel-input"
                    value={cluster.userNotes}
                    onChange={e => updateNotes(cluster.id, e.target.value)}
                    placeholder="CONDITION, EDITION, PRICE OVERRIDE (e.g. $40)..."
                    rows={2}
                    style={{ resize: "vertical", minHeight: 60 }}
                />
            </div>
        </div>
    );
}
