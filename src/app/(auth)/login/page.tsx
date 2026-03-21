"use client";

/**
 * Materia Magical Staff — Login Page
 * Retro pixel-art styled email+password sign-in.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const result = await signIn.email({
                email,
                password,
                callbackURL: "/",
            });

            if (result.error) {
                setError(result.error.message ?? "Invalid credentials. Try again.");
            } else {
                router.push("/");
                router.refresh();
            }
        } catch {
            setError("A network error occurred. Check your connection.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="retro-body retro-scanlines"
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                padding: "2rem",
                background: `radial-gradient(ellipse at center, #1a0a2e 0%, var(--retro-bg) 70%)`,
            }}
        >
            {/* Stars background */}
            <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
                {Array.from({ length: 40 }).map((_, i) => (
                    <div
                        key={i}
                        style={{
                            position: "absolute",
                            width: i % 5 === 0 ? 3 : 2,
                            height: i % 5 === 0 ? 3 : 2,
                            background: "var(--retro-white)",
                            borderRadius: "50%",
                            opacity: Math.random() * 0.6 + 0.2,
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            animation: `blink ${1.5 + Math.random() * 3}s step-start infinite`,
                            animationDelay: `${Math.random() * 3}s`,
                        }}
                    />
                ))}
            </div>

            <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480 }}>
                {/* Logo / Header */}
                <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
                    {/* Pixel crystal orb */}
                    <div
                        style={{
                            display: "inline-block",
                            width: 80,
                            height: 80,
                            marginBottom: "1.5rem",
                            background: `radial-gradient(circle at 35% 35%, var(--retro-purple), #2d0060 60%, var(--retro-shadow))`,
                            border: "4px solid var(--retro-yellow)",
                            boxShadow: `
                                0 0 0 2px var(--retro-shadow),
                                0 0 0 6px var(--retro-purple),
                                0 0 20px rgba(155, 89, 255, 0.5)
                            `,
                            position: "relative",
                        }}
                    >
                        {/* Shine */}
                        <div style={{
                            position: "absolute",
                            top: 10,
                            left: 14,
                            width: 16,
                            height: 10,
                            background: "rgba(255,255,255,0.4)",
                            transform: "rotate(-30deg)",
                        }} />
                        {/* Star in orb */}
                        <div style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 28,
                        }}>✦</div>
                    </div>

                    <h1 className="retro-title" style={{ fontSize: 14, marginBottom: "0.5rem" }}>
                        MATERIA
                    </h1>
                    <h1 className="retro-title" style={{ fontSize: 14, marginBottom: "1rem" }}>
                        MAGICAL STAFF
                    </h1>
                    <p className="retro-subtitle">
                        SELLER SYSTEM v2.0
                    </p>
                </div>

                {/* Login Panel */}
                <div className="pixel-border" style={{ padding: "2rem" }}>
                    <h2
                        className="retro-subtitle"
                        style={{ textAlign: "center", marginBottom: "1.5rem" }}
                    >
                        ▶ INSERT CREDENTIALS ◀
                    </h2>

                    {error && (
                        <div
                            className="pixel-border-red"
                            style={{
                                background: "rgba(255, 55, 55, 0.1)",
                                padding: "12px 16px",
                                marginBottom: "1.25rem",
                                border: "3px solid var(--retro-red)",
                                boxShadow: "none",
                            }}
                        >
                            <p className="retro-error">⚠ {error.toUpperCase()}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <div>
                            <label htmlFor="email" className="retro-label">EMAIL ADDRESS</label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className={`pixel-input${error ? " pixel-input-error" : ""}`}
                                placeholder="you@domain.com"
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="retro-label">PASSWORD</label>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className={`pixel-input${error ? " pixel-input-error" : ""}`}
                                placeholder="••••••••"
                                autoComplete="current-password"
                            />
                        </div>

                        <button
                            type="submit"
                            className="pixel-btn"
                            disabled={loading}
                            style={{ width: "100%", marginTop: "0.5rem", fontSize: 12, padding: "16px 24px" }}
                        >
                            {loading ? (
                                <span>LOADING<span className="blink">_</span></span>
                            ) : (
                                "▶ INSERT COIN"
                            )}
                        </button>
                    </form>

                    <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                        <p className="retro-body-text" style={{ fontSize: 16, color: "var(--retro-muted)" }}>
                            No save file?{" "}
                            <Link
                                href="/signup"
                                style={{
                                    color: "var(--retro-teal)",
                                    textDecoration: "underline",
                                    textUnderlineOffset: 4,
                                }}
                            >
                                CREATE NEW GAME
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer credits */}
                <p style={{ textAlign: "center", marginTop: "1.5rem" }} className="retro-body-text">
                    <span style={{ color: "var(--retro-muted)", fontSize: 14 }}>
                        © MATERIA ARTS 2026 · ALL RIGHTS RESERVED
                    </span>
                </p>
            </div>
        </div>
    );
}
