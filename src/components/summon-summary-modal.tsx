"use client";

/**
 * SummonSummaryModal — Session 22 rewrite
 *
 * Post-publish results modal. Messaging adapts based on publishMode:
 *
 *   "schedule"    — Items are SCHEDULED to go live in 2 weeks. Visit Seller Hub
 *                   to review, edit, or cancel before they go live.
 *
 *   "publish_now" — Items are LIVE on eBay right now.
 *
 * Shows three result categories:
 *   1. Successfully published with Best Offer enabled
 *   2. Successfully published (no Best Offer — user disabled or category rejected)
 *   3. Failed — full eBay error details per item, with stage label
 */

type PublishMode = "schedule" | "publish_now";

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
    /** Set when eBay rejected Best Offer for the category and the listing was retried without it */
    notice?: string;
}

interface SummonSummaryModalProps {
    isOpen: boolean;
    publishMode: PublishMode;
    successWithBestOffer: SucceededItem[];
    successWithoutBestOffer: SucceededItem[];
    failedItems: FailedItem[];
    onClose: () => void;
}

export function SummonSummaryModal({
    isOpen,
    publishMode,
    successWithBestOffer,
    successWithoutBestOffer,
    failedItems,
    onClose,
}: SummonSummaryModalProps) {
    if (!isOpen) return null;

    const successCount = successWithBestOffer.length + successWithoutBestOffer.length;
    const totalAttempted = successCount + failedItems.length;
    const isScheduled = publishMode === "schedule";

    return (
        <div className="summon-modal-overlay" onClick={onClose}>
            <div
                className="summon-modal pixel-border-green"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Publish to eBay Results"
            >
                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="summon-modal-header">
                    <div className="retro-title" style={{ fontSize: 14 }}>
                        {isScheduled ? "✦ LISTINGS SCHEDULED ✦" : "⚡ LISTINGS PUBLISHED ✦"}
                    </div>
                    <button
                        className="pixel-btn"
                        onClick={onClose}
                        style={{ fontSize: 9, padding: "6px 12px" }}
                        aria-label="Close modal"
                    >
                        ✕ CLOSE
                    </button>
                </div>

                {/* ── Mode banner ───────────────────────────────────────────── */}
                {isScheduled ? (
                    <div
                        className="summon-draft-banner"
                        style={{ borderColor: "var(--retro-green)", color: "var(--retro-green)" }}
                    >
                        ✓ SCHEDULED — Listings will go live automatically in 2 weeks.
                        Visit eBay Seller Hub to review, edit, or cancel them before
                        they go live.
                    </div>
                ) : (
                    <div
                        className="summon-draft-banner"
                        style={{ borderColor: "var(--retro-red)", color: "var(--retro-red)" }}
                    >
                        ⚡ LIVE NOW — These listings are active on eBay immediately.
                        Buyers can purchase them right now.
                    </div>
                )}

                {/* ── Overall success count ─────────────────────────────────── */}
                <div className="summon-modal-success retro-panel">
                    <div
                        className="retro-title"
                        style={{ fontSize: 28, color: "var(--retro-green)", textAlign: "center" }}
                    >
                        {successCount}
                    </div>
                    <div
                        className="retro-label"
                        style={{ textAlign: "center", color: "var(--retro-muted)", marginTop: 4 }}
                    >
                        OF {totalAttempted}{" "}
                        {isScheduled ? "LISTINGS SCHEDULED ON EBAY" : "LISTINGS PUBLISHED LIVE ON EBAY"}
                    </div>
                    {successCount > 0 && (
                        <p
                            className="retro-body-text"
                            style={{ textAlign: "center", marginTop: 12, fontSize: 10 }}
                        >
                            {isScheduled
                                ? "Your items are scheduled in Seller Hub and will go live in 14 days. You can still edit or remove them before then."
                                : "Your items are live on eBay. Go to Seller Hub to manage your active listings."}
                        </p>
                    )}
                </div>

                {/* ── Category 1: Successfully published WITH Best Offer ────── */}
                {successWithBestOffer.length > 0 && (
                    <div className="summon-modal-section" style={{ marginTop: 16 }}>
                        <div
                            className="retro-label"
                            style={{
                                color: "var(--retro-green)",
                                marginBottom: 8,
                                fontSize: 10,
                            }}
                        >
                            ✓ {successWithBestOffer.length}{" "}
                            {isScheduled ? "SCHEDULED" : "PUBLISHED"} WITH BEST OFFER ENABLED
                        </div>
                        {successWithBestOffer.map((item) => (
                            <div
                                key={item.listingId}
                                className="retro-body-text"
                                style={{ fontSize: 9, padding: "4px 0", borderBottom: "1px solid var(--retro-border)" }}
                            >
                                {item.title || item.sku}
                                <span className="retro-label" style={{ color: "var(--retro-muted)", marginLeft: 8, fontSize: 8 }}>
                                    SKU: {item.sku}
                                </span>
                                {item.ebayListingId && (
                                    <span className="retro-label" style={{ color: "var(--retro-muted)", marginLeft: 8, fontSize: 8 }}>
                                        Listing: {item.ebayListingId}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Category 2: Successfully published WITHOUT Best Offer ─── */}
                {successWithoutBestOffer.length > 0 && (
                    <div className="summon-modal-section" style={{ marginTop: 16 }}>
                        <div
                            className="retro-label"
                            style={{
                                color: "var(--retro-green)",
                                marginBottom: 8,
                                fontSize: 10,
                            }}
                        >
                            ✓ {successWithoutBestOffer.length}{" "}
                            {isScheduled ? "SCHEDULED" : "PUBLISHED"}
                        </div>
                        {successWithoutBestOffer.map((item) => (
                            <div
                                key={item.listingId}
                                style={{ padding: "4px 0", borderBottom: "1px solid var(--retro-border)" }}
                            >
                                <div className="retro-body-text" style={{ fontSize: 9 }}>
                                    {item.title || item.sku}
                                    <span className="retro-label" style={{ color: "var(--retro-muted)", marginLeft: 8, fontSize: 8 }}>
                                        SKU: {item.sku}
                                    </span>
                                    {item.ebayListingId && (
                                        <span className="retro-label" style={{ color: "var(--retro-muted)", marginLeft: 8, fontSize: 8 }}>
                                            Listing: {item.ebayListingId}
                                        </span>
                                    )}
                                </div>
                                {item.notice && (
                                    <div
                                        className="retro-label"
                                        style={{ color: "var(--retro-amber)", fontSize: 8, marginTop: 2 }}
                                    >
                                        ⚠ {item.notice}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Category 3: Failed ────────────────────────────────────── */}
                {failedItems.length > 0 && (
                    <div className="summon-modal-failures" style={{ marginTop: 16 }}>
                        <div
                            className="retro-label"
                            style={{
                                color: "var(--retro-red)",
                                marginBottom: 12,
                                fontSize: 10,
                            }}
                        >
                            ✗ {failedItems.length} ITEM{failedItems.length !== 1 ? "S" : ""} FAILED
                            — Items remain on the dashboard for editing and retry.
                        </div>

                        {failedItems.map((item) => (
                            <div
                                key={`${item.listingId}-${item.stage}`}
                                className="summon-error-card pixel-border-red"
                            >
                                <div className="summon-error-card-header">
                                    <span
                                        className="retro-label"
                                        style={{ color: "var(--retro-amber)", fontSize: 9 }}
                                    >
                                        [{item.stage.toUpperCase()} STAGE]
                                    </span>
                                    <span
                                        className="retro-body-text"
                                        style={{ fontSize: 9, fontWeight: "bold" }}
                                    >
                                        {item.title || item.sku}
                                    </span>
                                    <span
                                        className="retro-label"
                                        style={{ color: "var(--retro-muted)", fontSize: 8 }}
                                    >
                                        SKU: {item.sku}
                                    </span>
                                </div>

                                {item.errors.map((err, ei) => (
                                    <pre
                                        key={ei}
                                        className="retro-error-block"
                                        style={{ marginTop: 8 }}
                                    >
                                        {[
                                            err.errorId ? `errorId   : ${err.errorId}` : null,
                                            err.domain ? `domain    : ${err.domain}` : null,
                                            err.category ? `category  : ${err.category}` : null,
                                            err.message ? `message   : ${err.message}` : null,
                                            err.longMessage ? `longMsg   : ${err.longMessage}` : null,
                                            err.parameters?.length
                                                ? `parameters: ${JSON.stringify(err.parameters)}`
                                                : null,
                                        ]
                                            .filter(Boolean)
                                            .join("\n")}
                                    </pre>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Footer ────────────────────────────────────────────────── */}
                <div className="summon-modal-footer">
                    <button className="pixel-btn pixel-btn-primary" onClick={onClose}>
                        ◆ RETURN TO DASHBOARD ◆
                    </button>
                </div>
            </div>
        </div>
    );
}
