"use client";

/**
 * SummonButton — Session 22 rewrite
 *
 * Sticky action bar at the bottom of the Review Dashboard.
 * Provides two distinct publishing modes:
 *
 *   SCHEDULE (2 WEEKS)
 *     Publishes offers with a listingStartDate 14 days from now.
 *     Listings appear in Seller Hub as SCHEDULED — the user can see, edit,
 *     or cancel them before they go live. Safe default.
 *
 *   PUBLISH NOW
 *     Publishes offers immediately. Listings go LIVE on eBay at once.
 *     Gated by a full-screen confirmation modal that the user must explicitly
 *     acknowledge before any API call is made.
 */

import { useState } from "react";
import { useGallery } from "@/lib/gallery-store";
import { SummonSummaryModal } from "./summon-summary-modal";

interface GlobalPrefs {
    shippingPolicyId: string;
    returnPolicyId: string;
    paymentPolicyId: string;
}

interface SummonButtonProps {
    globalPrefs: GlobalPrefs | null;
}

interface EbayErrorObject {
    errorId?: number;
    domain?: string;
    category?: string;
    message?: string;
    longMessage?: string;
    parameters?: Array<{ name: string; value: string }>;
}

interface FailedItem {
    listingId: string;
    sku: string;
    title: string;
    stage: "inventory" | "offer" | "publish";
    errors: EbayErrorObject[];
}

interface SucceededItem {
    listingId: string;
    sku: string;
    title: string;
    offerId: string;
    ebayListingId?: string;
    notice?: string;
}

type PublishMode = "schedule" | "publish_now";

interface SummonResult {
    publishMode: PublishMode;
    successWithBestOffer: SucceededItem[];
    successWithoutBestOffer: SucceededItem[];
    failedItems: FailedItem[];
    skuToOfferId: Record<string, string>;
    skuToListingId: Record<string, string>;
    validationViolations?: string[];
}

export function SummonButton({ globalPrefs }: SummonButtonProps) {
    const { listings, updateListing } = useGallery();

    const [isSummoning, setIsSummoning] = useState(false);
    const [activeMode, setActiveMode] = useState<PublishMode | null>(null);
    const [summonResult, setSummonResult] = useState<SummonResult | null>(null);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Only include listings that have been through the pipeline (have a sku)
    const eligibleListings = listings.filter(
        (l) => l.sku && l.status !== "pending" && l.status !== "processing"
    );

    const alreadySubmittedCount = listings.filter(
        (l) => l.status === "submitted"
    ).length;

    const policiesReady =
        !!globalPrefs?.shippingPolicyId &&
        !!globalPrefs?.returnPolicyId &&
        !!globalPrefs?.paymentPolicyId;

    const canSummon = eligibleListings.length > 0 && !isSummoning && policiesReady;

    // ── Core summon logic ─────────────────────────────────────────────────────

    const executeSummon = async (mode: PublishMode) => {
        if (!canSummon || !globalPrefs) return;
        setIsSummoning(true);
        setActiveMode(mode);
        setError(null);
        setIsConfirmModalOpen(false);

        try {
            const response = await fetch("/api/summon", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    listings: eligibleListings,
                    publishMode: mode,
                    globalPrefs: {
                        shippingPolicyId: globalPrefs.shippingPolicyId,
                        returnPolicyId: globalPrefs.returnPolicyId,
                        paymentPolicyId: globalPrefs.paymentPolicyId,
                    },
                }),
            });

            const result: SummonResult = await response.json();

            if (!response.ok) {
                setError(
                    (result as unknown as { error: string }).error ||
                    "Summon failed. Check console for details."
                );
                return;
            }

            // Pre-flight validation violations: surface inline without opening modal
            if (result.validationViolations?.length) {
                setError(
                    `Please fix the following before summoning:\n• ${result.validationViolations.join("\n• ")}`
                );
                return;
            }

            // Build set of failed listing IDs
            const failedIds = new Set(result.failedItems.map((f) => f.listingId));
            const skuToOfferId = result.skuToOfferId;
            const skuToListingId = result.skuToListingId ?? {};

            // Track which listings had Best Offer rejected by eBay
            const bestOfferRejected = new Set(
                [...result.successWithoutBestOffer]
                    .filter((s) => !!s.notice)
                    .map((s) => s.listingId)
            );

            // Update each listing's status in local state
            for (const listing of eligibleListings) {
                if (failedIds.has(listing.id)) {
                    const failedItem = result.failedItems.find(
                        (f) => f.listingId === listing.id
                    );
                    updateListing(listing.id, {
                        status: "failed",
                        ebayError: failedItem?.errors ?? null,
                    });
                } else if (skuToOfferId[listing.sku]) {
                    const updates: Partial<typeof listing> = {
                        status: "submitted",
                        ebayOfferResponse: {
                            offerId: skuToOfferId[listing.sku],
                            listingId: skuToListingId[listing.sku],
                        },
                        ebayError: null,
                    };
                    if (bestOfferRejected.has(listing.id)) {
                        updates.bestOfferEligible = false;
                        updates.acceptOffers = false;
                        updates.autoAcceptPriceCAD = null;
                    }
                    updateListing(listing.id, updates);
                }
            }

            setSummonResult(result);
            setIsResultModalOpen(true);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Network error. Please try again."
            );
        } finally {
            setIsSummoning(false);
            setActiveMode(null);
        }
    };

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleScheduleClick = () => {
        if (!canSummon) return;
        executeSummon("schedule");
    };

    const handlePublishNowClick = () => {
        if (!canSummon) return;
        // Open the confirmation modal — do NOT call the API yet
        setIsConfirmModalOpen(true);
    };

    const handleConfirmPublishNow = () => {
        executeSummon("publish_now");
    };

    const handleCancelConfirm = () => {
        setIsConfirmModalOpen(false);
    };

    if (listings.length === 0) return null;

    return (
        <>
            {/* ── Sticky summon bar ─────────────────────────────────────────── */}
            <div className="summon-bar pixel-border-green retro-panel">

                {/* Error row — rendered INSIDE the sticky bar so it's always visible */}
                {error && (
                    <div className="summon-bar-error">
                        ✗ {error}
                    </div>
                )}

                {/* Main row: info + buttons */}
                <div className="summon-bar-main">
                {/* Info row */}
                <div className="summon-bar-info">
                    <div className="retro-body-text" style={{ fontSize: 9 }}>
                        {eligibleListings.length} item{eligibleListings.length !== 1 ? "s" : ""} ready to publish
                        {alreadySubmittedCount > 0 &&
                            ` · ${alreadySubmittedCount} already submitted`}
                    </div>
                    {!policiesReady && (
                        <div
                            className="retro-label"
                            style={{ color: "var(--retro-amber)", fontSize: 8, marginTop: 4 }}
                        >
                            ⚠ Select shipping, return &amp; payment policies in the header first
                        </div>
                    )}
                </div>

                {/* Two-button row */}
                <div className="summon-btn-row">
                    {/* SCHEDULE button */}
                    <button
                        className={`pixel-btn pixel-btn-emerald portal-title-text summon-btn ${
                            isSummoning && activeMode === "schedule" ? "summon-btn-loading" : ""
                        }`}
                        onClick={handleScheduleClick}
                        disabled={!canSummon || isSummoning}
                        title="Publish as a scheduled listing — goes live in 2 weeks. Review, edit, or cancel in Seller Hub first."
                        aria-label="Schedule listings to go live in 2 weeks"
                    >
                        {isSummoning && activeMode === "schedule" ? (
                            <>
                                <span className="summon-btn-spinner">◆</span>
                                SCHEDULING...
                            </>
                        ) : (
                            "✦ SCHEDULE (2 WEEKS) ✦"
                        )}
                    </button>

                    {/* PUBLISH NOW button */}
                    <button
                        className={`pixel-btn pixel-btn-danger portal-title-text summon-btn summon-btn-publish-now ${
                            isSummoning && activeMode === "publish_now" ? "summon-btn-loading" : ""
                        }`}
                        onClick={handlePublishNowClick}
                        disabled={!canSummon || isSummoning}
                        title="Publish listings immediately as active eBay listings."
                        aria-label="Publish listings live on eBay immediately"
                    >
                        {isSummoning && activeMode === "publish_now" ? (
                            <>
                                <span className="summon-btn-spinner">◆</span>
                                PUBLISHING NOW...
                            </>
                        ) : (
                            "⚡ PUBLISH NOW ⚡"
                        )}
                    </button>
                </div>
                </div>{/* end summon-bar-main */}
            </div>

            {/* ── Publish Now confirmation modal ────────────────────────────── */}
            {isConfirmModalOpen && (
                <div
                    className="summon-confirm-overlay"
                    onClick={handleCancelConfirm}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Confirm Publish Now"
                >
                    <div
                        className="summon-confirm-modal pixel-border-red retro-panel"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="summon-confirm-icon">⚡</div>
                        <div
                            className="retro-title"
                            style={{ fontSize: 13, color: "var(--retro-red)", textAlign: "center", marginBottom: 16 }}
                        >
                            ARE YOU SURE?
                        </div>
                        <p
                            className="retro-body-text"
                            style={{ fontSize: 10, textAlign: "center", lineHeight: 1.8, marginBottom: 8 }}
                        >
                            You are about to post{" "}
                            <strong style={{ color: "var(--retro-yellow)" }}>
                                {eligibleListings.length} listing{eligibleListings.length !== 1 ? "s" : ""}
                            </strong>{" "}
                            directly as{" "}
                            <strong style={{ color: "var(--retro-red)" }}>
                                ACTIVE, LIVE LISTINGS
                            </strong>{" "}
                            on eBay — right now, as-is.
                        </p>
                        <p
                            className="retro-body-text"
                            style={{ fontSize: 10, textAlign: "center", lineHeight: 1.8, marginBottom: 20 }}
                        >
                            Buyers will be able to purchase these items immediately.
                            Please double-check your titles, prices, and descriptions
                            before proceeding.
                        </p>
                        <div
                            className="retro-label"
                            style={{
                                color: "var(--retro-amber)",
                                fontSize: 9,
                                textAlign: "center",
                                padding: "10px 16px",
                                border: "1px solid var(--retro-amber)",
                                marginBottom: 20,
                            }}
                        >
                            ⚠ TIP: Use &quot;SCHEDULE (2 WEEKS)&quot; instead if you want
                            time to review listings in Seller Hub first.
                        </div>
                        <div className="summon-confirm-btn-row">
                            <button
                                className="pixel-btn portal-title-text"
                                onClick={handleCancelConfirm}
                                style={{ fontSize: 9 }}
                            >
                                ✕ CANCEL
                            </button>
                            <button
                                className="pixel-btn pixel-btn-danger portal-title-text"
                                onClick={handleConfirmPublishNow}
                                style={{ fontSize: 9 }}
                            >
                                ⚡ YES, PUBLISH ALL NOW
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Results modal ─────────────────────────────────────────────── */}
            {summonResult && (
                <SummonSummaryModal
                    isOpen={isResultModalOpen}
                    publishMode={summonResult.publishMode}
                    successWithBestOffer={summonResult.successWithBestOffer}
                    successWithoutBestOffer={summonResult.successWithoutBestOffer}
                    failedItems={summonResult.failedItems}
                    onClose={() => setIsResultModalOpen(false)}
                />
            )}
        </>
    );
}
