"use client";

/**
 * Materia Magical Staff — Ungrouped Image Card
 *
 * A single standalone image card in the gallery grid, before it has been
 * grouped into a cluster. The entire card is draggable.
 *
 * Drag behavior:
 *   - Dragging this card and dropping it on another UngroupedImageCard
 *     calls createClusterFromImages().
 *   - Dragging this card and dropping it on an ItemCluster card
 *     calls mergeImageIntoCluster().
 *   - This card CAN be a drop target for other ungrouped images
 *     (creates a new cluster from the two).
 */

import type { DragEvent } from "react";
import type { ImageItem } from "@/types";
import { useGallery } from "@/lib/gallery-store";

interface UngroupedImageCardProps {
    image: ImageItem;
    onDragStart: (e: DragEvent, imageId: string) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent, targetImageId: string) => void;
    onRemove: (imageId: string) => void;
}

export function UngroupedImageCard({
    image,
    onDragStart,
    onDragOver,
    onDrop,
    onRemove,
}: UngroupedImageCardProps) {
    const { updateImageNotes } = useGallery();

    return (
        <div
            className="image-card"
            draggable
            onDragStart={e => onDragStart(e, image.id)}
            onDragOver={onDragOver}
            onDrop={e => onDrop(e, image.id)}
            style={{ position: "relative", cursor: "grab" }}
        >
            {/* Thumbnail */}
            <div className="image-card-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={image.url}
                    alt={image.filename}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                    }}
                    draggable={false}
                />

                {/* Overlay label */}
                <div className="image-card-overlay">
                    <span className="retro-body-text" style={{ fontSize: 12, color: "var(--retro-muted)" }}>
                        ⠿ DRAG TO GROUP
                    </span>
                </div>
            </div>

            {/* Remove button */}
            <button
                className="pixel-btn pixel-btn-sm pixel-btn-danger image-card-remove"
                onClick={e => { e.stopPropagation(); onRemove(image.id); }}
                aria-label={`Remove ${image.filename}`}
                title="Remove image"
                style={{ fontSize: 9 }}
            >
                ✕
            </button>

            {/* Filename label + price override indicator */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 6px",
                    gap: 4,
                }}
            >
                <div
                    className="retro-body-text"
                    style={{
                        fontSize: 12,
                        color: "var(--retro-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                    }}
                >
                    {image.filename.length > 20
                        ? image.filename.slice(0, 17) + "..."
                        : image.filename}
                </div>
                {image.priceOverride !== null && (
                    <span
                        className="retro-body-text"
                        style={{ fontSize: 11, color: "var(--retro-green)", flexShrink: 0 }}
                    >
                        ★ ${image.priceOverride.toFixed(2)}
                    </span>
                )}
            </div>

            {/* Notes field — stop drag propagation so typing doesn't trigger D&D */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
                style={{ padding: "0 6px 8px" }}
                onDragStart={e => e.stopPropagation()}
            >
                <textarea
                    className="pixel-input"
                    value={image.userNotes}
                    onChange={e => updateImageNotes(image.id, e.target.value)}
                    placeholder="NOTES: SIZE, EDITION, PRICE ($35)..."
                    rows={2}
                    style={{
                        resize: "vertical",
                        minHeight: 48,
                        fontSize: 10,
                        width: "100%",
                        boxSizing: "border-box",
                        cursor: "text",
                    }}
                    aria-label="Item notes"
                />
                {image.priceOverride !== null && (
                    <div
                        className="retro-body-text"
                        style={{
                            fontSize: 10,
                            color: "var(--retro-green)",
                            marginTop: 3,
                        }}
                    >
                        ★ PRICE DETECTED — AI PRICING BYPASSED
                    </div>
                )}
            </div>
        </div>
    );
}
