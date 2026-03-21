"use client";

/**
 * Materia Magical Staff — Global Header
 *
 * Persistent, collapsible top-bar always visible to authenticated users.
 * On mount: fetches eBay policies + saved user preferences in parallel.
 * On any field change: debounced PUT /api/preferences (500ms).
 *
 * Contains:
 *   - App logo + nav
 *   - Shipping / Return / Payment policy selectors (from eBay API)
 *   - Accept Offers toggle
 *   - Auto-Accept threshold % input
 *   - Collapse/expand toggle
 *   - Sign-out button
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useTheme } from "next-themes";
import type { FulfillmentPolicy, ReturnPolicy, PaymentPolicy } from "@/lib/ebayService";

// ── Types ───────────────────────────────────────────────────────
interface Preferences {
    shippingPolicyId: string | null;
    returnPolicyId: string | null;
    paymentPolicyId: string | null;
    acceptOffers: boolean;
    autoAcceptThreshold: number;
}

interface PolicyData {
    fulfillmentPolicies: FulfillmentPolicy[];
    returnPolicies: ReturnPolicy[];
    paymentPolicies: PaymentPolicy[];
}

// ── Props ────────────────────────────────────────────────────────
interface GlobalHeaderProps {
    /**
     * Called whenever policy IDs are loaded from the DB or changed by the user.
     * page.tsx uses this to keep its own globalPrefs state in sync so the
     * SummonButton always reflects the current selection without a page reload.
     */
    onPrefsChange?: (prefs: {
        shippingPolicyId: string | null;
        returnPolicyId: string | null;
        paymentPolicyId: string | null;
        acceptOffers: boolean;
        autoAcceptThreshold: number;
    }) => void;
}

// ── Component ────────────────────────────────────────────────────
export function GlobalHeader({ onPrefsChange }: GlobalHeaderProps = {}) {
    const router = useRouter();
    const { data: session } = useSession();

    const [collapsed, setCollapsed] = useState(false);
    const [policyData, setPolicyData] = useState<PolicyData | null>(null);
    const [policyError, setPolicyError] = useState<string | null>(null);
    const [policiesLoading, setPoliciesLoading] = useState(true);

    const [prefs, setPrefs] = useState<Preferences>({
        shippingPolicyId: null,
        returnPolicyId: null,
        paymentPolicyId: null,
        acceptOffers: true,
        autoAcceptThreshold: 10,
    });

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // ── Fetch policies + preferences on mount ──────────────────
    useEffect(() => {
        async function load() {
            setPoliciesLoading(true);
            try {
                const [policiesRes, prefsRes] = await Promise.all([
                    fetch("/api/ebay/policies"),
                    fetch("/api/preferences"),
                ]);

                if (policiesRes.ok) {
                    setPolicyData(await policiesRes.json());
                } else {
                    const err = await policiesRes.json().catch(() => ({}));
                    setPolicyError(err?.error ?? `eBay error ${policiesRes.status}`);
                }

                if (prefsRes.ok) {
                    const savedPrefs = await prefsRes.json();
                    const loaded: Preferences = {
                        shippingPolicyId: savedPrefs.shippingPolicyId ?? null,
                        returnPolicyId: savedPrefs.returnPolicyId ?? null,
                        paymentPolicyId: savedPrefs.paymentPolicyId ?? null,
                        acceptOffers: savedPrefs.acceptOffers ?? true,
                        autoAcceptThreshold: savedPrefs.autoAcceptThreshold ?? 10,
                    };
                    setPrefs(loaded);
                    onPrefsChange?.(loaded);
                }
            } catch {
                setPolicyError("Network error — could not reach eBay API.");
            } finally {
                setPoliciesLoading(false);
            }
        }
        load();
    }, []);

    // ── Debounced preference save ──────────────────────────────
    const savePrefs = useCallback((updated: Preferences) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaveStatus("saving");
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                await fetch("/api/preferences", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updated),
                });
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            } catch {
                setSaveStatus("idle");
            }
        }, 500);
    }, []);

    function updatePref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
        const updated = { ...prefs, [key]: value };
        setPrefs(updated);
        savePrefs(updated);
        onPrefsChange?.(updated);
    }

    // ── Sign out ───────────────────────────────────────────────
    async function handleSignOut() {
        await signOut();
        router.push("/login");
    }

    // ── Render ─────────────────────────────────────────────────
    return (
        <header className="pixel-header">
            {/* ── Top Bar (always visible) ── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 20px",
                    gap: 16,
                    borderBottom: collapsed ? "none" : "2px solid var(--retro-border)",
                    borderBottomColor: "var(--retro-border)",
                }}
            >
                {/* Logo */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>✦</span>
                    <span
                        className="retro-title cinzel-text"
                        style={{ fontSize: 10, color: "var(--retro-yellow)" }}
                    >
                        MATERIA STAFF
                    </span>
                </div>

                {/* Right side: save indicator + collapse + user + signout */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {saveStatus === "saving" && (
                        <span className="retro-body-text" style={{ fontSize: 14, color: "var(--retro-muted)" }}>
                            SAVING<span className="blink">_</span>
                        </span>
                    )}
                    {saveStatus === "saved" && (
                        <span className="retro-body-text" style={{ fontSize: 14, color: "var(--retro-green)" }}>
                            ✔ SAVED
                        </span>
                    )}

                    {session?.user?.email && (
                        <span
                            className="retro-body-text"
                            style={{ fontSize: 14, color: "var(--retro-muted)", display: "none" }}
                            id="header-user-email"
                        >
                            {session.user.email}
                        </span>
                    )}

                    {mounted && (
                        <select
                            className="pixel-select"
                            title="Switch UI Theme"
                            style={{ width: 'auto', padding: '4px 24px 4px 10px', fontSize: 10, height: 26, borderColor: 'var(--retro-shadow)' }}
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                        >
                            <option value="theme-early-90s">EARLY 90S</option>
                            <option value="theme-late-90s">LATE 90S RPG</option>
                            <option value="theme-adventure">ADVENTURE</option>
                            <option value="theme-modern">MODERN</option>
                        </select>
                    )}

                    <button
                        className="pixel-btn pixel-btn-sm pixel-btn-ghost"
                        onClick={() => setCollapsed(c => !c)}
                        aria-label={collapsed ? "Expand settings" : "Collapse settings"}
                        style={{ fontSize: 8 }}
                    >
                        {collapsed ? "▼ MENU" : "▲ MENU"}
                    </button>

                    <button
                        className="pixel-btn pixel-btn-sm pixel-btn-danger"
                        onClick={handleSignOut}
                        style={{ fontSize: 8 }}
                    >
                        SIGN OUT
                    </button>
                </div>
            </div>

            {/* ── Collapsible Body ── */}
            {!collapsed && (
                <div
                    style={{
                        padding: "14px 20px",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "1rem",
                        alignItems: "end",
                    }}
                >
                    {/* Policy Loading State */}
                    {policiesLoading && (
                        <div
                            style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}
                        >
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    background: "var(--retro-yellow)",
                                    animation: "blink 0.5s step-start infinite",
                                }}
                            />
                            <span className="retro-body-text" style={{ color: "var(--retro-muted)", fontSize: 16 }}>
                                CONTACTING EBAY...
                            </span>
                        </div>
                    )}

                    {/* Policy Error */}
                    {!policiesLoading && policyError && (
                        <div
                            style={{
                                gridColumn: "1 / -1",
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "10px 14px",
                                border: "2px solid var(--retro-red)",
                            }}
                        >
                            <span style={{ fontSize: 16 }}>⚠</span>
                            <span className="retro-error" style={{ fontSize: 8 }}>
                                EBAY UNREACHABLE: {policyError.toUpperCase()}
                            </span>
                        </div>
                    )}

                    {/* Shipping Policy */}
                    {!policiesLoading && policyData && (
                        <>
                            <div>
                                <label className="retro-label cinzel-text">SHIPPING POLICY</label>
                                <select
                                    className="pixel-select"
                                    value={prefs.shippingPolicyId ?? ""}
                                    onChange={e => updatePref("shippingPolicyId", e.target.value || null)}
                                >
                                    <option value="">-- SELECT --</option>
                                    {policyData.fulfillmentPolicies.map(p => (
                                        <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Return Policy */}
                            <div>
                                <label className="retro-label cinzel-text">RETURN POLICY</label>
                                <select
                                    className="pixel-select"
                                    value={prefs.returnPolicyId ?? ""}
                                    onChange={e => updatePref("returnPolicyId", e.target.value || null)}
                                >
                                    <option value="">-- SELECT --</option>
                                    {policyData.returnPolicies.map(p => (
                                        <option key={p.returnPolicyId} value={p.returnPolicyId}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Payment Policy */}
                            <div>
                                <label className="retro-label cinzel-text">PAYMENT POLICY</label>
                                <select
                                    className="pixel-select"
                                    value={prefs.paymentPolicyId ?? ""}
                                    onChange={e => updatePref("paymentPolicyId", e.target.value || null)}
                                >
                                    <option value="">-- SELECT --</option>
                                    {policyData.paymentPolicies.map(p => (
                                        <option key={p.paymentPolicyId} value={p.paymentPolicyId}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {/* Accept Offers Toggle */}
                    <div>
                        <label className="retro-label cinzel-text">ACCEPT OFFERS</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 40 }}>
                            <label className="pixel-toggle">
                                <input
                                    type="checkbox"
                                    checked={prefs.acceptOffers}
                                    onChange={e => updatePref("acceptOffers", e.target.checked)}
                                />
                                <div className="pixel-toggle-track" />
                                <div className="pixel-toggle-thumb" />
                            </label>
                            <span
                                className="retro-body-text"
                                style={{
                                    fontSize: 16,
                                    color: prefs.acceptOffers ? "var(--retro-green)" : "var(--retro-muted)",
                                }}
                            >
                                {prefs.acceptOffers ? "ON" : "OFF"}
                            </span>
                        </div>
                    </div>

                    {/* Auto-Accept Threshold — only visible when acceptOffers is on */}
                    {prefs.acceptOffers && (
                        <div>
                            <label className="retro-label cinzel-text">
                                AUTO-ACCEPT THRESHOLD
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="pixel-input"
                                    value={prefs.autoAcceptThreshold}
                                    onChange={e =>
                                        updatePref("autoAcceptThreshold", Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))
                                    }
                                    style={{
                                        width: 80,
                                        textAlign: "center",
                                    }}
                                />
                                <span className="retro-body-text" style={{ color: "var(--retro-muted)", fontSize: 16 }}>
                                    % BELOW ASK
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
}
