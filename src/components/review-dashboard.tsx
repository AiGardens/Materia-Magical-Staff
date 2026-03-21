"use client";

/**
 * ReviewDashboard — Phase 5
 *
 * Scrollable feed of all processed ListingObjects from the gallery store.
 * Renders a <ListingCard> for each listing in order.
 * Shows a summary stats bar at the top (total items, reviewed count).
 */

import { useGallery } from "@/lib/gallery-store";
import { ListingCard } from "./listing-card";

export function ReviewDashboard() {
    const { listings } = useGallery();

    const reviewedCount = listings.filter(l => l.status === "reviewed").length;
    const failedCount = listings.filter(l => l.status === "failed").length;

    return (
        <div className="review-dashboard" id="review-dashboard">
            {/* ── Summary Header ──────────────────────────────────────────── */}
            <div className="review-dashboard-header pixel-border-green retro-panel">
                <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
                    <div className="retro-title" style={{ fontSize: 13 }}>
                        ✦ REVIEW DASHBOARD ✦
                    </div>
                    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
                        <StatChip
                            label="TOTAL"
                            value={listings.length}
                            color="var(--retro-white)"
                        />
                        <StatChip
                            label="REVIEWED"
                            value={reviewedCount}
                            color="var(--retro-green)"
                        />
                        <StatChip
                            label="PENDING"
                            value={listings.length - reviewedCount - failedCount}
                            color="var(--retro-amber)"
                        />
                        {failedCount > 0 && (
                            <StatChip
                                label="FAILED"
                                value={failedCount}
                                color="var(--retro-red)"
                            />
                        )}
                    </div>
                </div>

                {/* Completion progress bar */}
                <div style={{ marginTop: "1rem" }}>
                    <div className="retro-label" style={{ marginBottom: 6, fontSize: 8 }}>
                        REVIEW PROGRESS: {listings.length > 0
                            ? Math.round((reviewedCount / listings.length) * 100)
                            : 0}%
                    </div>
                    <div className="pixel-progress-track">
                        <div
                            className="pixel-progress-fill"
                            style={{
                                width: listings.length > 0
                                    ? `${(reviewedCount / listings.length) * 100}%`
                                    : "0%",
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Listing Cards ──────────────────────────────────────────── */}
            <div className="review-dashboard-feed">
                {listings.map((listing, i) => (
                    <ListingCard
                        key={listing.id}
                        listing={listing}
                        index={i}
                    />
                ))}
            </div>

            {/* ── Empty state (should not normally appear) ────────────── */}
            {listings.length === 0 && (
                <div
                    className="retro-panel"
                    style={{ textAlign: "center", padding: "3rem" }}
                >
                    <p className="retro-body-text" style={{ color: "var(--retro-muted)" }}>
                        No listings found. Process some images first.
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Stat Chip ──────────────────────────────────────────────────────────────

function StatChip({
    label,
    value,
    color,
}: {
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span
                className="retro-title"
                style={{ fontSize: 20, color }}
            >
                {value}
            </span>
            <span
                className="retro-label"
                style={{ fontSize: 7, marginBottom: 0, color: "var(--retro-muted)" }}
            >
                {label}
            </span>
        </div>
    );
}
