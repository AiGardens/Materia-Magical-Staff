"use client";

/**
 * Materia Magical Staff — Welcome Screen
 * Shown on the dashboard before any images are uploaded.
 * Phase 3 replaces this with the upload zone + listing gallery.
 */

export function WelcomeScreen() {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2rem",
                textAlign: "center",
            }}
        >
            <div className="pixel-border welcome-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 800 }}>
                {/* Pixel art treasure chest */}
                <div style={{ width: 120, height: 90, position: "relative" }}>
                    {/* Chest body */}
                    <div style={{
                        position: "absolute",
                        bottom: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 100,
                        height: 65,
                        background: `linear-gradient(180deg, #8B5E3C 0%, #5C3A18 100%)`,
                        border: "4px solid var(--retro-yellow)",
                        boxShadow: "0 0 0 2px var(--retro-shadow), 0 0 0 6px var(--retro-yellow), 0 0 0 8px var(--retro-shadow)",
                    }} />
                    {/* Chest lid */}
                    <div style={{
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 100,
                        height: 35,
                        background: `linear-gradient(180deg, #A0723A 0%, #7A4E22 100%)`,
                        border: "4px solid var(--retro-yellow)",
                        borderBottom: "none",
                        boxShadow: "0 0 0 2px var(--retro-shadow), 4px -4px 0 4px rgba(0,0,0,0.3)",
                    }} />
                    {/* Lock */}
                    <div style={{
                        position: "absolute",
                        bottom: 22,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 18,
                        height: 18,
                        background: "var(--retro-yellow)",
                        border: "3px solid var(--retro-shadow)",
                        boxShadow: "1px 1px 0 var(--retro-shadow)",
                        zIndex: 1,
                    }} />
                    {/* Gold band top */}
                    <div style={{
                        position: "absolute",
                        top: 18,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 68,
                        height: 4,
                        background: "var(--retro-yellow)",
                        opacity: 0.4,
                    }} />
                    {/* Gold band bottom */}
                    <div style={{
                        position: "absolute",
                        top: 40,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 68,
                        height: 4,
                        background: "var(--retro-yellow)",
                        opacity: 0.4,
                    }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center", marginTop: "1.5rem" }}>
                    <p className="retro-title portal-title-text" style={{ fontSize: 48, color: "var(--retro-yellow)", letterSpacing: 4, lineHeight: 1 }}>
                        STEP 1
                    </p>
                    <h1 className="retro-title portal-title-text" style={{ fontSize: 16, lineHeight: 1.6 }}>
                        Drag &amp; drop your Bulk product<br />photos to begin crafting listings.
                    </h1>
                </div>

                {/* Blinking prompt */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "1rem" }}>
                    <div
                        className="blink"
                        style={{ width: 12, height: 20, background: "var(--retro-yellow)" }}
                    />
                    <span className="retro-body-text" style={{ color: "var(--retro-yellow)", fontSize: 18 }}>
                        AWAITING INPUT
                    </span>
                    <div
                        className="blink"
                        style={{ width: 12, height: 20, background: "var(--retro-yellow)", animationDelay: "0.5s" }}
                    />
                </div>
            </div>
        </div>
    );
}
