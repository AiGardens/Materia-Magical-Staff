"use client";

/**
 * ProcessingScreen — Phase 4
 *
 * Full-screen retro loading overlay shown while the AI pipeline processes
 * a batch of image clusters. Covers the entire viewport, locks interaction,
 * and shows per-item progress with an animated retro progress bar.
 *
 * Usage:
 *   <ProcessingScreen
 *     clusters={clusters}
 *     globalPrefs={prefs}
 *     onComplete={(listings) => setListings(listings)}
 *     onCancel={() => setProcessing(false)}
 *   />
 *
 * Processing runs async: each cluster is processed sequentially (to avoid
 * hammering Gemini's rate limits) and the UI updates after each one.
 */

import { useEffect, useRef, useState } from "react";
import type { Cluster, ListingObject } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GlobalPrefs {
    acceptOffers: boolean;
    autoAcceptThreshold: number | null;
}

interface ProcessingScreenProps {
    clusters: Cluster[];
    globalPrefs: GlobalPrefs;
    onComplete: (listings: ListingObject[]) => void;
}

type ItemStatus = "pending" | "processing" | "done" | "failed";

interface ItemState {
    cluster: Cluster;
    status: ItemStatus;
    error?: string;
    listing?: ListingObject;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: derive a short display label from a cluster
// ─────────────────────────────────────────────────────────────────────────────

function clusterLabel(cluster: Cluster, index: number): string {
    if (cluster.userNotes?.trim()) {
        const note = cluster.userNotes.trim();
        return note.length > 40 ? note.slice(0, 40) + "…" : note;
    }
    return `Item ${index + 1} (${cluster.images.length} image${cluster.images.length !== 1 ? "s" : ""})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ProcessingScreen({ clusters, globalPrefs, onComplete }: ProcessingScreenProps) {
    const [items, setItems] = useState<ItemState[]>(
        clusters.map((cluster) => ({ cluster, status: "pending" }))
    );
    const [isDone, setIsDone] = useState(false);

    const totalItems = clusters.length;
    const doneCount = items.filter((i) => i.status === "done" || i.status === "failed").length;
    const progressPct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;

    // ── Run pipeline sequentially ────────────────────────────────────────────
    useEffect(() => {
        let isCancelled = false;

        async function runAll() {
            const results: ListingObject[] = [];
            let hasErrors = false;

            for (let i = 0; i < clusters.length; i++) {
                if (isCancelled) return;
                const cluster = clusters[i];

                // Mark this item as processing
                setItems((prev) =>
                    prev.map((item, idx) =>
                        idx === i ? { ...item, status: "processing" } : item
                    )
                );

                try {
                    const response = await fetch("/api/pipeline", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            cluster,
                            globalPrefs,
                            modelOverride: "flash",
                        }),
                    });

                    const data = await response.json();

                    if (!response.ok || data.error) {
                        throw new Error(data.error ?? `HTTP ${response.status}`);
                    }

                    const listing: ListingObject = data.listing;
                    results.push(listing);

                    setItems((prev) =>
                        prev.map((item, idx) =>
                            idx === i ? { ...item, status: "done", listing } : item
                        )
                    );
                } catch (err: unknown) {
                    hasErrors = true;
                    const errorMsg = err instanceof Error ? err.message : "Unknown error";
                    setItems((prev) =>
                        prev.map((item, idx) =>
                            idx === i ? { ...item, status: "failed", error: errorMsg } : item
                        )
                    );
                    // Don't halt the batch — push a stub with failed status
                    // The cluster data remains intact so the user can view and retry
                }

                // Force a 4-second delay between items to respect Gemini Free Tier 15 RPM limits
                // Skip the delay after the very last item in the array
                if (i < clusters.length - 1 && !isCancelled) {
                    await new Promise(resolve => setTimeout(resolve, 4000));
                }
            }

            if (!isCancelled) {
                setIsDone(true);
                // Only auto-dismiss if EVERYTHING succeeded.
                // If there are errors, force the user to click a 'Dismiss' button.
                if (!hasErrors) {
                    onComplete(results);
                }
            }
        }

        runAll();

        return () => {
            isCancelled = true;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─────────────────────────────────────────────────────────────────────────
    // Render helpers
    // ─────────────────────────────────────────────────────────────────────────

    const stepMessages = [
        "SCANNING IMAGES...",
        "SEARCHING MARKET DATA...",
        "FETCHING EBAY TAXONOMY...",
        "ASSEMBLING LISTING...",
        "CALCULATING OFFER...",
    ];
    const [msgIndex, setMsgIndex] = useState(0);

    useEffect(() => {
        if (isDone) return;
        const interval = setInterval(() => {
            setMsgIndex((prev) => (prev + 1) % stepMessages.length);
        }, 2200);
        return () => clearInterval(interval);
    }, [isDone]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div
            className="retro-body"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(10, 10, 26, 0.97)",
                backdropFilter: "blur(4px)",
                padding: "2rem",
            }}
        >
            {/* ── Main dialog box ─────────────────────────────────────────────── */}
            <div
                className="pixel-border"
                style={{ width: "100%", maxWidth: 620, padding: "2.5rem 2rem" }}
            >
                {/* Title */}
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                    <div className="retro-title portal-title-text" style={{ fontSize: 20, marginBottom: 12, color: "var(--retro-orange)" }}>
                        ◆ PROCESSING ITEMS ◆
                    </div>
                    <div className="retro-subtitle">
                        {isDone ? (
                            <span style={{ color: "var(--retro-green)" }}>✓ ANALYSIS COMPLETE</span>
                        ) : (
                            <span className="blink">{stepMessages[msgIndex]}</span>
                        )}
                    </div>
                </div>

                {/* Progress counter */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 8,
                    }}
                >
                    <span className="retro-label" style={{ marginBottom: 0 }}>
                        PROGRESS
                    </span>
                    <span className="retro-label" style={{ marginBottom: 0, color: "var(--retro-teal)" }}>
                        {doneCount} / {totalItems}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="pixel-progress-track" style={{ marginBottom: "1.5rem" }}>
                    <div
                        className="pixel-progress-fill"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                {/* Item status list */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        maxHeight: "280px",
                        overflowY: "auto",
                        paddingRight: 4,
                    }}
                >
                    {items.map((item, idx) => (
                        <div
                            key={item.cluster.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "6px 10px",
                                background:
                                    item.status === "processing"
                                        ? "rgba(255, 215, 0, 0.06)"
                                        : item.status === "done"
                                            ? "rgba(0, 255, 65, 0.04)"
                                            : item.status === "failed"
                                                ? "rgba(255, 55, 55, 0.05)"
                                                : "transparent",
                                border:
                                    item.status === "processing"
                                        ? "1px solid rgba(255, 215, 0, 0.2)"
                                        : "1px solid transparent",
                                transition: "background 200ms ease",
                            }}
                        >
                            {/* Status icon */}
                            <span
                                style={{
                                    fontFamily: "'VT323', monospace",
                                    fontSize: 18,
                                    width: 20,
                                    textAlign: "center",
                                    color:
                                        item.status === "processing"
                                            ? "var(--retro-yellow)"
                                            : item.status === "done"
                                                ? "var(--retro-green)"
                                                : item.status === "failed"
                                                    ? "var(--retro-red)"
                                                    : "var(--retro-muted)",
                                    flexShrink: 0,
                                }}
                                className={item.status === "processing" ? "blink" : undefined}
                            >
                                {item.status === "pending"
                                    ? "○"
                                    : item.status === "processing"
                                        ? "►"
                                        : item.status === "done"
                                            ? "✓"
                                            : "✗"}
                            </span>

                            {/* Label */}
                            <span
                                style={{
                                    fontFamily: "'VT323', monospace",
                                    fontSize: 17,
                                    color:
                                        item.status === "failed"
                                            ? "var(--retro-red)"
                                            : item.status === "done"
                                                ? "var(--retro-white)"
                                                : item.status === "processing"
                                                    ? "var(--retro-yellow)"
                                                    : "var(--retro-muted)",
                                    flex: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {clusterLabel(item.cluster, idx)}
                            </span>

                            {/* Error msg */}
                            {item.status === "failed" && item.error && (
                                <span
                                    style={{
                                        fontFamily: "'VT323', monospace",
                                        fontSize: 14,
                                        color: "var(--retro-red)",
                                        maxWidth: "40%",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        flexShrink: 0,
                                    }}
                                    title={item.error}
                                >
                                    {item.error}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Done state footer */}
                {isDone && (
                    <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                        {items.some(i => i.status === "failed") ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                                <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: "var(--retro-red)" }}>
                                    ⚠ SOME ITEMS FAILED TO PROCESS ⚠
                                </div>
                                <button
                                    className="pixel-btn pixel-btn-primary"
                                    onClick={() => onComplete(items.filter(i => i.status === "done" && i.listing).map(i => i.listing!))}
                                    style={{ padding: "10px 24px", fontSize: 16 }}
                                >
                                    CONTINUE TO DASHBOARD
                                </button>
                            </div>
                        ) : (
                            <div
                                style={{
                                    fontFamily: "'VT323', monospace",
                                    fontSize: 18,
                                    color: "var(--retro-teal)",
                                }}
                            >
                                ▼ SCROLL DOWN TO REVIEW YOUR LISTINGS ▼
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
