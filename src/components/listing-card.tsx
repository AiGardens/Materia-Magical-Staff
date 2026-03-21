"use client";

/**
 * ListingCard — Phase 5
 *
 * Renders a single fully processed ListingObject as an inline-editable,
 * retro-styled card in the Review Dashboard.
 *
 * Features:
 * - Image gallery with main image highlighted
 * - All generated fields are inline-editable (title, price, condition,
 *   description, dimensions, weight, item specifics, toggles)
 * - 4 confidence gauges (product detection, pricing, packaging, condition)
 * - Clickable pricing source URLs
 * - Pricing rationale paragraph
 * - "Dig Deeper" button — re-runs pipeline with gemini-2.5-pro
 * - Status badge (pending / reviewed / failed / submitted)
 */

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import type { ListingObject } from "@/types";
import { ConfidenceGauge } from "./confidence-gauge";
import { useGallery } from "@/lib/gallery-store";
import type { AspectSchemaEntry } from "@/types/aspectSchema";

interface ListingCardProps {
    listing: ListingObject;
    index: number;
}

interface GlobalPrefs {
    acceptOffers: boolean;
    autoAcceptThreshold: number | null;
}

// ── Helper: Status Badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ListingObject["status"] }) {
    const config: Record<
        ListingObject["status"],
        { label: string; color: string }
    > = {
        pending: { label: "PENDING", color: "var(--retro-muted)" },
        processing: { label: "PROCESSING", color: "var(--retro-teal)" },
        reviewed: { label: "REVIEWED", color: "var(--retro-green)" },
        submitted: { label: "SUBMITTED", color: "var(--retro-blue)" },
        failed: { label: "FAILED", color: "var(--retro-red)" },
    };
    const { label, color } = config[status];
    return (
        <span
            className="status-badge"
            style={{ color, borderColor: color }}
        >
            {label}
        </span>
    );
}

// ── Helper: Editable Field ───────────────────────────────────────────────────

interface EditableFieldProps {
    label: string;
    value: string | number;
    onChange: (v: string) => void;
    type?: "text" | "number" | "textarea";
    rows?: number;
    mono?: boolean;
    unit?: string;
}

function EditableField({
    label,
    value,
    onChange,
    type = "text",
    rows = 3,
    mono = false,
    unit,
}: EditableFieldProps) {
    const fontClass = mono ? "pixel-input pixel-input-mono" : "pixel-input";
    const strVal = value === null || value === undefined ? "" : String(value);

    return (
        <div className="editable-field">
            <label className="retro-label">{label}</label>
            {type === "textarea" ? (
                <textarea
                    className={`${fontClass} pixel-input-textarea`}
                    value={strVal}
                    rows={rows}
                    onChange={e => onChange(e.target.value)}
                />
            ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        className={fontClass}
                        type={type}
                        value={strVal}
                        onChange={e => onChange(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    {unit && (
                        <span className="retro-body-text" style={{ color: "var(--retro-muted)", flexShrink: 0 }}>
                            {unit}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ListingCard({ listing, index }: ListingCardProps) {
    const { clusters, updateListing } = useGallery();
    const [isDigging, setIsDigging] = useState(false);
    const [digError, setDigError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [showDescription, setShowDescription] = useState(false);
    const [showSpecifics, setShowSpecifics] = useState(false);
    const [showSources, setShowSources] = useState(false);
    // Phase 6 offer UX state
    const [autoAcceptError, setAutoAcceptError] = useState<string | null>(null);
    const [autoAcceptRecalculated, setAutoAcceptRecalculated] = useState(false);
    // Cached global autoAcceptThreshold percentage (e.g. 15 means 15%)
    const [globalAutoAcceptThreshold, setGlobalAutoAcceptThreshold] = useState<number | null>(null);

    // Fetch global prefs once on mount to get the authoritative threshold %
    useEffect(() => {
        fetch("/api/preferences")
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.autoAcceptThreshold != null) {
                    setGlobalAutoAcceptThreshold(d.autoAcceptThreshold);
                }
            })
            .catch(() => { /* non-fatal */ });
    }, []);


    // ── Inline update helpers ───────────────────────────────────────────────

    const update = useCallback(
        (patch: Partial<ListingObject>) => {
            updateListing(listing.id, patch);
        },
        [listing.id, updateListing]
    );

    const updateDimension = useCallback(
        (key: keyof typeof listing.dimensions, val: string) => {
            update({
                dimensions: {
                    ...listing.dimensions,
                    [key]: key === "unit" ? val : parseFloat(val) || 0,
                },
            });
        },
        [listing.dimensions, update]
    );

    const updateWeight = useCallback(
        (key: keyof typeof listing.weight, val: string) => {
            update({
                weight: {
                    ...listing.weight,
                    [key]: key === "unit" ? val : parseFloat(val) || 0,
                },
            });
        },
        [listing.weight, update]
    );

    const updateItemSpecific = useCallback(
        (aspectName: string, val: string | string[]) => {
            const newSpecifics = { ...listing.itemSpecifics, [aspectName]: val };

            // Recalculate aspectCompletionScore live
            let newScore = listing.aspectCompletionScore;
            if (listing.aspectSchema && listing.aspectSchema.length > 0) {
                const populatedCount = Object.keys(newSpecifics).filter(k => {
                    const v = newSpecifics[k];
                    if (Array.isArray(v)) return v.length > 0;
                    return v !== "" && v !== null && v !== undefined;
                }).length;
                newScore = Math.round((populatedCount / listing.aspectSchema.length) * 100);
            }

            update({
                itemSpecifics: newSpecifics,
                aspectCompletionScore: newScore
            });
        },
        [listing.itemSpecifics, listing.aspectSchema, listing.aspectCompletionScore, update]
    );

    // ── Helper: Item Specifics Dynamic Fields ─────────────────────────────
    const renderSpecificField = (aspect: AspectSchemaEntry) => {
        // Find existing value. Value might be missing.
        // It could be string or string[].
        const rawValue = listing.itemSpecifics?.[aspect.aspectName];
        const isMulti = aspect.cardinality === "MULTI";

        let displayValue = rawValue;
        if (displayValue === undefined || displayValue === null) {
            displayValue = isMulti ? [] : "";
        }

        // Validate requiredness for UI highlights
        const isMissingRequired = aspect.required && (
            (isMulti && Array.isArray(displayValue) && displayValue.length === 0) ||
            (!isMulti && displayValue === "")
        );

        const labelStyle = {
            fontSize: 8,
            color: isMissingRequired ? "var(--retro-red)" : "inherit"
        };

        const labelText = `${aspect.aspectName.toUpperCase()}${aspect.required ? " *" : ""}`;

        if (aspect.mode === "SELECTION_ONLY" && aspect.allowedValues.length > 0) {
            if (isMulti) {
                // For MULTI, we need a way to select multiple. A simple approach in HTML is a multiple select.
                // The retro css might not style it perfectly, but we'll try to use pixel-select.
                const currentValues = Array.isArray(displayValue) ? displayValue : (displayValue ? [String(displayValue)] : []);
                return (
                    <div key={aspect.aspectName} className="specific-field">
                        <label className="retro-label" style={labelStyle} title={isMissingRequired ? "Required field missing" : ""}>
                            {labelText}
                        </label>
                        <select
                            multiple
                            className={`pixel-select ${isMissingRequired ? "pixel-border-red" : ""}`}
                            value={currentValues}
                            onChange={e => {
                                const selected = Array.from(e.target.selectedOptions, option => option.value);
                                updateItemSpecific(aspect.aspectName, selected);
                            }}
                            style={{ height: "auto", minHeight: 60 }}
                        >
                            {aspect.allowedValues.map(val => (
                                <option key={val} value={val}>{val}</option>
                            ))}
                        </select>
                    </div>
                );
            } else {
                // SINGLE select
                const currentValue = Array.isArray(displayValue) ? (displayValue[0] || "") : String(displayValue);
                return (
                    <div key={aspect.aspectName} className="specific-field">
                        <label className="retro-label" style={labelStyle} title={isMissingRequired ? "Required field missing" : ""}>
                            {labelText}
                        </label>
                        <select
                            className={`pixel-select ${isMissingRequired ? "pixel-border-red" : ""}`}
                            value={currentValue}
                            onChange={e => updateItemSpecific(aspect.aspectName, e.target.value)}
                        >
                            <option value="">-- Select --</option>
                            {aspect.allowedValues.map(val => (
                                <option key={val} value={val}>{val}</option>
                            ))}
                        </select>
                    </div>
                )
            }
        } else {
            // FREE_TEXT
            if (isMulti) {
                // For free text multi, typically a comma-separated input or tag editor.
                // We'll use a simple text input where users can comma-split, then we split on blur/change.
                const currentValue = Array.isArray(displayValue) ? displayValue.join(", ") : String(displayValue);
                return (
                    <div key={aspect.aspectName} className="specific-field">
                        <label className="retro-label" style={labelStyle} title={isMissingRequired ? "Required field missing" : ""}>
                            {labelText} <span style={{ fontSize: 7 }}>(comma separated)</span>
                        </label>
                        <input
                            className={`pixel-input ${isMissingRequired ? "pixel-border-red" : ""}`}
                            value={currentValue}
                            onChange={e => {
                                const arr = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                                updateItemSpecific(aspect.aspectName, arr);
                            }}
                        />
                    </div>
                );
            } else {
                // SINGLE free text
                const currentValue = Array.isArray(displayValue) ? (displayValue[0] || "") : String(displayValue);
                return (
                    <div key={aspect.aspectName} className="specific-field">
                        <label className="retro-label" style={labelStyle} title={isMissingRequired ? "Required field missing" : ""}>
                            {labelText}
                        </label>
                        <input
                            className={`pixel-input ${isMissingRequired ? "pixel-border-red" : ""}`}
                            value={currentValue}
                            onChange={e => updateItemSpecific(aspect.aspectName, e.target.value)}
                            style={{ fontSize: 16 }}
                        />
                    </div>
                );
            }
        }
    }

    // ── Dig Deeper ────────────────────────────────────────────────────────

    async function handleDigDeeper() {
        // Find the original cluster by matching listing.id to cluster.id
        // (pipeline assigns the cluster.id as the listing.id)
        const cluster = clusters.find(c => c.id === listing.id);

        if (!cluster) {
            setDigError(
                "Cannot find original image cluster. Re-upload to re-analyze."
            );
            return;
        }

        // Fetch global prefs for the re-run
        let globalPrefs: GlobalPrefs = {
            acceptOffers: listing.acceptOffers,
            autoAcceptThreshold: listing.autoAcceptPriceCAD,
        };
        try {
            const r = await fetch("/api/preferences");
            if (r.ok) {
                const d = await r.json();
                globalPrefs = {
                    acceptOffers: d.acceptOffers ?? false,
                    autoAcceptThreshold: d.autoAcceptThreshold ?? null,
                };
            }
        } catch {
            // Non-fatal — use listing's current values
        }

        setIsDigging(true);
        setDigError(null);

        try {
            const resp = await fetch("/api/pipeline", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cluster,
                    globalPrefs,
                    modelOverride: "pro",
                }),
            });
            const data = await resp.json() as { listing?: ListingObject; error?: string };
            if (!resp.ok || data.error) {
                setDigError(data.error ?? "Dig Deeper failed. Please try again.");
            } else if (data.listing) {
                // Replace listing in store (keeps same id)
                updateListing(listing.id, data.listing);
            }
        } catch (err) {
            setDigError(
                err instanceof Error ? err.message : "Network error."
            );
        } finally {
            setIsDigging(false);
        }
    }

    // ── Price override note ─────────────────────────────────────────────────

    const hasPriceOverride = listing.priceOverride !== null;

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div
            className={`listing-card retro-panel${listing.status === "failed" ? " pixel-border-red" : " pixel-border"
                }`}
            id={`listing-card-${listing.id}`}
        >
            {/* ── Card Header ─────────────────────────────────────────── */}
            <div className="listing-card-header">
                <div className="listing-card-header-left">
                    <span className="retro-subtitle" style={{ fontSize: 9 }}>
                        #{String(index + 1).padStart(3, "0")} — {listing.sku}
                    </span>
                    <StatusBadge status={listing.status} />
                    {hasPriceOverride && (
                        <span className="price-override-badge">⧗ PRICE LOCKED</span>
                    )}
                </div>
                <div className="listing-card-header-right">
                    <button
                        className="pixel-btn pixel-btn-sm"
                        onClick={handleDigDeeper}
                        disabled={isDigging}
                        title="Re-analyze this item with Gemini Pro (more powerful model)"
                    >
                        {isDigging ? "⏳ DIGGING..." : "🔍 DIG DEEPER"}
                    </button>
                    <button
                        className="pixel-btn pixel-btn-sm pixel-btn-ghost"
                        onClick={() => setIsExpanded(e => !e)}
                        title={isExpanded ? "Collapse card" : "Expand card"}
                    >
                        {isExpanded ? "▲ COLLAPSE" : "▼ EXPAND"}
                    </button>
                </div>
            </div>

            {/* Dig Deeper error */}
            {digError && (
                <div className="retro-error" style={{ padding: "8px 16px", borderBottom: "1px solid var(--retro-red)" }}>
                    ✗ {digError}
                </div>
            )}

            {/* Dig Deeper loading overlay */}
            {isDigging && (
                <div className="dig-deeper-loading">
                    <span className="retro-title" style={{ fontSize: 10 }}>
                        ✦ GEMINI PRO ANALYZING... ✦
                    </span>
                    <div className="pixel-progress-track" style={{ marginTop: 12, maxWidth: 360 }}>
                        <div
                            className="pixel-progress-fill"
                            style={{ width: "100%", animation: "progress-shine 1.5s linear infinite" }}
                        />
                    </div>
                </div>
            )}

            {isExpanded && (
                <div className="listing-card-body">
                    {/* ── Product Images ────────────────────────────────── */}
                    <section className="listing-card-section">
                        <div className="listing-card-images">
                            {listing.imageUrls.map((url, i) => {
                                const isMain = url === listing.mainImageUrl;
                                return (
                                    <div
                                        key={`${listing.id}-img-${i}`}
                                        className={`listing-card-img-wrap${isMain ? " listing-card-img-main" : ""}`}
                                    >
                                        <Image
                                            src={url}
                                            alt={isMain ? "Main product image" : `Product image ${i + 1}`}
                                            fill
                                            sizes="(max-width: 768px) 50vw, 160px"
                                            style={{ objectFit: "cover" }}
                                            unoptimized
                                        />
                                        {isMain && (
                                            <div className="main-image-badge">★ MAIN</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* ── Confidence Gauges ─────────────────────────────── */}
                    <section className="listing-card-section">
                        <div className="retro-label" style={{ marginBottom: 12 }}>
                            AI CONFIDENCE SCORES
                        </div>
                        <div className="confidence-gauges-grid">
                            <ConfidenceGauge
                                label="PRODUCT DETECTION"
                                value={listing.confidenceScores?.productDetection ?? 0}
                            />
                            <ConfidenceGauge
                                label="PRICING"
                                value={listing.confidenceScores?.pricing ?? 0}
                            />
                            <ConfidenceGauge
                                label="PACKAGING"
                                value={listing.confidenceScores?.packaging ?? 0}
                            />
                            <ConfidenceGauge
                                label="CONDITION"
                                value={listing.confidenceScores?.condition ?? 0}
                            />
                            {listing.aspectCompletionScore !== null && listing.aspectCompletionScore !== undefined && (
                                <ConfidenceGauge
                                    label="FIELD COMPLETION"
                                    value={listing.aspectCompletionScore}
                                />
                            )}
                        </div>
                    </section>

                    {/* ── Core Listing Fields ───────────────────────────── */}
                    <section className="listing-card-section listing-card-two-col">
                        {/* Left column — title, condition, price */}
                        <div className="listing-card-col">
                            <EditableField
                                label="TITLE"
                                value={listing.title ?? ""}
                                onChange={v => update({ title: v })}
                            />

                            <div className="editable-field">
                                <label className="retro-label">CONDITION</label>
                                <select
                                    className="pixel-select"
                                    value={listing.condition ?? ""}
                                    onChange={e => update({ condition: e.target.value })}
                                >
                                    {[
                                        "NEW",
                                        "LIKE_NEW",
                                        "USED_EXCELLENT",
                                        "USED_VERY_GOOD",
                                        "USED_GOOD",
                                        "USED_ACCEPTABLE",
                                        "FOR_PARTS_OR_NOT_WORKING",
                                    ].map(c => (
                                        <option key={c} value={c}>
                                            {c.replace(/_/g, " ")}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <EditableField
                                label="CONDITION DESCRIPTION"
                                value={listing.conditionDescription ?? ""}
                                onChange={v => update({ conditionDescription: v })}
                                type="textarea"
                                rows={2}
                            />
                        </div>

                        {/* Right column — pricing */}
                        <div className="listing-card-col">
                            <div className="editable-field">
                                <label className="retro-label">
                                    FINAL PRICE (CAD)
                                    {hasPriceOverride && (
                                        <span style={{ color: "var(--retro-green)", marginLeft: 8 }}>
                                            [OVERRIDDEN]
                                        </span>
                                    )}
                                </label>
                                <input
                                    className="pixel-input"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={listing.finalPriceCAD ?? 0}
                                    onChange={e => {
                                        const newPrice = parseFloat(e.target.value) || 0;
                                        const patch: Partial<ListingObject> = { finalPriceCAD: newPrice };
                                        // If autoAcceptPriceCAD is now >= newPrice, recalculate it
                                        if (
                                            listing.acceptOffers &&
                                            listing.bestOfferEligible &&
                                            listing.autoAcceptPriceCAD !== null &&
                                            listing.autoAcceptPriceCAD >= newPrice
                                        ) {
                                            // Recalculate using the global autoAcceptThreshold %
                                            // (falls back to 15% if not yet loaded)
                                            const thresholdPct = globalAutoAcceptThreshold ?? 15;
                                            patch.autoAcceptPriceCAD = parseFloat(
                                                (newPrice * (1 - thresholdPct / 100)).toFixed(2)
                                            );
                                            setAutoAcceptRecalculated(true);
                                            setTimeout(() => setAutoAcceptRecalculated(false), 4000);
                                        }
                                        update(patch);
                                    }}
                                    style={{
                                        fontSize: 28,
                                        color: hasPriceOverride
                                            ? "var(--retro-green)"
                                            : "var(--retro-yellow)",
                                    }}
                                    readOnly={hasPriceOverride}
                                    title={hasPriceOverride ? "Price is locked by user note override" : undefined}
                                />
                            </div>

                            {listing.suggestedPriceCAD !== null && (
                                <div className="retro-body-text" style={{ fontSize: 14, color: "var(--retro-muted)" }}>
                                    AI Suggested: ${listing.suggestedPriceCAD?.toFixed(2)} CAD
                                </div>
                            )}

                            {/* ── Accept Offers toggle ────────────────────── */}
                            <div className="editable-field">
                                <label className="retro-label">ACCEPT OFFERS</label>
                                {listing.bestOfferEligible ? (
                                    // Normal interactive toggle
                                    <>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <label className="pixel-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={listing.acceptOffers ?? false}
                                                    onChange={e => {
                                                        const checked = e.target.checked;
                                                        update({
                                                            acceptOffers: checked,
                                                            // Clear threshold immediately when toggling off
                                                            autoAcceptPriceCAD: checked ? listing.autoAcceptPriceCAD : null,
                                                        });
                                                    }}
                                                />
                                                <span className="pixel-toggle-track" />
                                                <span className="pixel-toggle-thumb" />
                                            </label>
                                            <span className="retro-body-text">
                                                {listing.acceptOffers ? "YES" : "NO"}
                                            </span>
                                        </div>

                                        {/* ── Auto-accept price field ─────── */}
                                        {listing.acceptOffers && (
                                            <div className="editable-field" style={{ marginTop: 8 }}>
                                                <label className="retro-label">
                                                    AUTO-ACCEPT PRICE (CAD)
                                                </label>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <input
                                                        className="pixel-input"
                                                        type="number"
                                                        min={0}
                                                        step={0.01}
                                                        value={listing.autoAcceptPriceCAD ?? ""}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            // Validate: must be strictly lower than finalPriceCAD
                                                            if (!isNaN(val) && val < listing.finalPriceCAD) {
                                                                update({ autoAcceptPriceCAD: val });
                                                                setAutoAcceptError(null);
                                                            } else if (!isNaN(val)) {
                                                                // Do NOT save invalid value — show error instead
                                                                setAutoAcceptError(
                                                                    "Auto-accept price must be lower than the listing price."
                                                                );
                                                            } else {
                                                                // Empty / cleared
                                                                update({ autoAcceptPriceCAD: null });
                                                                setAutoAcceptError(null);
                                                            }
                                                        }}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <span className="retro-body-text" style={{ color: "var(--retro-muted)", flexShrink: 0 }}>
                                                        CAD
                                                    </span>
                                                </div>
                                                {autoAcceptError && (
                                                    <span
                                                        className="retro-body-text"
                                                        style={{ color: "var(--retro-red)", fontSize: 13, marginTop: 4, display: "block" }}
                                                    >
                                                        ✗ {autoAcceptError}
                                                    </span>
                                                )}
                                                {autoAcceptRecalculated && !autoAcceptError && (
                                                    <span
                                                        className="retro-body-text"
                                                        style={{ color: "var(--retro-teal)", fontSize: 13, marginTop: 4, display: "block" }}
                                                    >
                                                        ↻ Auto-accept price recalculated.
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // Best Offer not supported for this category — permanently disabled
                                    <>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: 0.4 }}>
                                            <label className="pixel-toggle" style={{ pointerEvents: "none", cursor: "not-allowed" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={false}
                                                    readOnly
                                                    tabIndex={-1}
                                                />
                                                <span className="pixel-toggle-track" />
                                                <span className="pixel-toggle-thumb" />
                                            </label>
                                            <span className="retro-body-text">NO</span>
                                        </div>
                                        <span
                                            className="retro-body-text"
                                            style={{ color: "var(--retro-muted)", fontSize: 13, marginTop: 4, display: "block" }}
                                        >
                                            Auto accept offer not available for this product.
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                    </section>

                    {/* ── Item Specifics ────────────────────────────────── */}
                    <section className="listing-card-section">
                        <button
                            className="pixel-btn pixel-btn-sm pixel-btn-ghost"
                            onClick={() => setShowSpecifics(s => !s)}
                            style={{ marginBottom: 12 }}
                        >
                            {showSpecifics ? "▲" : "▼"} ITEM SPECIFICS (
                            {Object.keys(listing.itemSpecifics ?? {}).length} / {listing.aspectSchema?.length || 0})
                        </button>
                        {showSpecifics && (
                            <div className="item-specifics-grid">
                                {listing.aspectSchema && listing.aspectSchema.length > 0 ? (
                                    listing.aspectSchema.map(aspect => renderSpecificField(aspect))
                                ) : (
                                    // Fallback if schema is missing for some reason
                                    Object.entries(listing.itemSpecifics ?? {}).map(
                                        ([key, val]) => (
                                            <div key={key} className="specific-field">
                                                <label className="retro-label" style={{ fontSize: 8 }}>
                                                    {key.toUpperCase()}
                                                </label>
                                                <input
                                                    className="pixel-input"
                                                    value={Array.isArray(val) ? val.join(", ") : (val ?? "")}
                                                    onChange={e => updateItemSpecific(key, e.target.value)}
                                                    style={{ fontSize: 16 }}
                                                />
                                            </div>
                                        )
                                    )
                                )}
                            </div>
                        )}
                    </section>

                    {/* ── Dimensions & Weight ───────────────────────────── */}
                    <section className="listing-card-section">
                        <div className="retro-label" style={{ marginBottom: 12 }}>
                            PACKAGING DIMENSIONS &amp; WEIGHT
                        </div>
                        <div className="dimensions-grid">
                            <EditableField
                                label={`LENGTH (${listing.dimensions?.unit ?? "in"})`}
                                value={listing.dimensions?.length ?? 0}
                                onChange={v => updateDimension("length", v)}
                                type="number"
                            />
                            <EditableField
                                label={`WIDTH (${listing.dimensions?.unit ?? "in"})`}
                                value={listing.dimensions?.width ?? 0}
                                onChange={v => updateDimension("width", v)}
                                type="number"
                            />
                            <EditableField
                                label={`HEIGHT (${listing.dimensions?.unit ?? "in"})`}
                                value={listing.dimensions?.height ?? 0}
                                onChange={v => updateDimension("height", v)}
                                type="number"
                            />
                            <div className="editable-field">
                                <label className="retro-label">DIM UNIT</label>
                                <select
                                    className="pixel-select"
                                    value={listing.dimensions?.unit ?? "in"}
                                    onChange={e =>
                                        updateDimension("unit", e.target.value)
                                    }
                                >
                                    <option value="in">in</option>
                                    <option value="cm">cm</option>
                                </select>
                            </div>
                            <EditableField
                                label={`WEIGHT (${listing.weight?.unit ?? "lb"})`}
                                value={listing.weight?.value ?? 0}
                                onChange={v => updateWeight("value", v)}
                                type="number"
                            />
                            <div className="editable-field">
                                <label className="retro-label">WEIGHT UNIT</label>
                                <select
                                    className="pixel-select"
                                    value={listing.weight?.unit ?? "lb"}
                                    onChange={e =>
                                        updateWeight("unit", e.target.value)
                                    }
                                >
                                    <option value="lb">lb</option>
                                    <option value="oz">oz</option>
                                    <option value="kg">kg</option>
                                    <option value="g">g</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ── HTML Description (collapsible) ────────────────── */}
                    <section className="listing-card-section">
                        <button
                            className="pixel-btn pixel-btn-sm pixel-btn-ghost"
                            onClick={() => setShowDescription(d => !d)}
                            style={{ marginBottom: 12 }}
                        >
                            {showDescription ? "▲" : "▼"} EBAY DESCRIPTION (HTML)
                        </button>
                        {showDescription && (
                            <EditableField
                                label="DESCRIPTION HTML"
                                value={listing.descriptionHtml ?? ""}
                                onChange={v => update({ descriptionHtml: v })}
                                type="textarea"
                                rows={8}
                                mono
                            />
                        )}
                    </section>

                    {/* ── Item Identity & Pricing Rationale ────────────── */}
                    <section className="listing-card-section">
                        <div className="retro-label">AI ITEM IDENTITY</div>
                        <p className="retro-body-text pricing-rationale">
                            {listing.itemIdentity}
                        </p>
                        {listing.pricingRationale && (
                            <>
                                <div className="retro-label" style={{ marginTop: 12 }}>
                                    PRICING RATIONALE
                                </div>
                                <p className="retro-body-text pricing-rationale">
                                    {listing.pricingRationale}
                                </p>
                            </>
                        )}
                    </section>

                    {/* ── Pricing Sources ───────────────────────────────── */}
                    {listing.pricingSources && listing.pricingSources.length > 0 && (
                        <section className="listing-card-section">
                            <button
                                className="pixel-btn pixel-btn-sm pixel-btn-ghost"
                                onClick={() => setShowSources(s => !s)}
                                style={{ marginBottom: 12 }}
                            >
                                {showSources ? "▲" : "▼"} PRICE SOURCES (
                                {listing.pricingSources.length})
                            </button>
                            {showSources && (
                                <ul className="pricing-sources-list">
                                    {listing.pricingSources.map((url, i) => (
                                        <li key={`src-${listing.id}-${i}`}>
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="retro-link"
                                                title={url}
                                            >
                                                [{String(i + 1).padStart(2, "0")}] {url.length > 80 ? url.slice(0, 77) + "..." : url}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}

                    {/* ── eBay Error (if failed) ────────────────────────── */}
                    {listing.ebayError && (
                        <section className="listing-card-section">
                            <div className="retro-label" style={{ color: "var(--retro-red)" }}>
                                EBAY ERROR
                            </div>
                            <pre className="retro-error-block">
                                {JSON.stringify(listing.ebayError, null, 2)}
                            </pre>
                        </section>
                    )}

                    {/* ── Card Footer ───────────────────────────────────── */}
                    <div className="listing-card-footer">
                        <span className="retro-subtitle">
                            CATEGORY ID: {listing.ebayCategoryId}
                        </span>
                        <button
                            className="pixel-btn pixel-btn-sm"
                            onClick={() =>
                                update({ status: "reviewed" })
                            }
                            disabled={listing.status === "reviewed"}
                            title="Mark this listing as reviewed"
                        >
                            {listing.status === "reviewed" ? "✓ REVIEWED" : "MARK REVIEWED"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
