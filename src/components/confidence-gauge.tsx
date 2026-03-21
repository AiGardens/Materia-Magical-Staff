"use client";

/**
 * ConfidenceGauge — Phase 5
 *
 * A retro HP-bar style visual representing a 0–100 confidence score.
 * Colors shift like a life bar: green > 70, yellow 40–70, red < 40.
 * No external libraries. Uses inline CSS variables and CSS classes
 * from globals.css.
 */

interface ConfidenceGaugeProps {
    /** 0–100 integer */
    value: number;
    /** Short label shown above the bar, e.g. "PRODUCT DETECTION" */
    label: string;
}

function getBarColor(value: number): string {
    if (value >= 70) return "var(--retro-green)";
    if (value >= 40) return "var(--retro-amber)";
    return "var(--retro-red)";
}

function getBarClass(value: number): string {
    if (value >= 70) return "gauge-fill gauge-fill-high";
    if (value >= 40) return "gauge-fill gauge-fill-mid";
    return "gauge-fill gauge-fill-low";
}

export function ConfidenceGauge({ value, label }: ConfidenceGaugeProps) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const color = getBarColor(clamped);

    return (
        <div className="confidence-gauge">
            <div className="confidence-gauge-header">
                <span className="confidence-gauge-label">{label}</span>
                <span
                    className="confidence-gauge-value"
                    style={{ color }}
                >
                    {clamped}%
                </span>
            </div>
            <div className="confidence-gauge-track">
                <div
                    className={getBarClass(clamped)}
                    style={{
                        width: `${clamped}%`,
                        background: color,
                    }}
                    role="progressbar"
                    aria-valuenow={clamped}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${label}: ${clamped}%`}
                />
                {/* Tick marks at 25, 50, 75 for visual reference */}
                {[25, 50, 75].map(tick => (
                    <div
                        key={tick}
                        className="confidence-gauge-tick"
                        style={{ left: `${tick}%` }}
                        aria-hidden="true"
                    />
                ))}
            </div>
        </div>
    );
}
