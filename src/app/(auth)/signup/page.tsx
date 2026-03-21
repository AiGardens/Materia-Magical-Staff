"use client";

/**
 * Materia Magical Staff — Signup Page
 * Retro pixel-art styled account creation.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";

export default function SignupPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            setLoading(false);
            return;
        }

        try {
            const result = await signUp.email({
                name,
                email,
                password,
                callbackURL: "/",
            });

            if (result.error) {
                setError(result.error.message ?? "Account creation failed. Try again.");
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
                background: `radial-gradient(ellipse at center, #0a1a2e 0%, var(--retro-bg) 70%)`,
            }}
        >
            <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480 }}>
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                    <h1 className="retro-title" style={{ fontSize: 13, marginBottom: "0.5rem" }}>
                        MATERIA MAGICAL STAFF
                    </h1>
                    <p className="retro-subtitle">CREATE SAVE FILE</p>
                </div>

                {/* Signup Panel */}
                <div className="pixel-border pixel-border-blue" style={{ padding: "2rem" }}>
                    <h2
                        className="retro-subtitle"
                        style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--retro-blue)" }}
                    >
                        ▶ NEW PLAYER ◀
                    </h2>

                    {error && (
                        <div
                            style={{
                                background: "rgba(255, 55, 55, 0.1)",
                                padding: "12px 16px",
                                marginBottom: "1.25rem",
                                border: "3px solid var(--retro-red)",
                            }}
                        >
                            <p className="retro-error">⚠ {error.toUpperCase()}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <div>
                            <label htmlFor="name" className="retro-label">PLAYER NAME</label>
                            <input
                                id="name"
                                type="text"
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="pixel-input"
                                placeholder="Enter name"
                                autoComplete="name"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" className="retro-label">EMAIL ADDRESS</label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="pixel-input"
                                placeholder="you@domain.com"
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="retro-label">SET PASSWORD</label>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="pixel-input"
                                placeholder="Min 8 characters"
                                autoComplete="new-password"
                            />
                        </div>

                        <button
                            type="submit"
                            className="pixel-btn"
                            disabled={loading}
                            style={{
                                width: "100%",
                                marginTop: "0.5rem",
                                fontSize: 10,
                                padding: "16px 24px",
                                background: "var(--retro-teal)",
                                color: "var(--retro-shadow)",
                            }}
                        >
                            {loading ? (
                                <span>SAVING<span className="blink">_</span></span>
                            ) : (
                                "✦ CREATE SAVE FILE"
                            )}
                        </button>
                    </form>

                    <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                        <p className="retro-body-text" style={{ fontSize: 16, color: "var(--retro-muted)" }}>
                            Already have a save?{" "}
                            <Link
                                href="/login"
                                style={{
                                    color: "var(--retro-yellow)",
                                    textDecoration: "underline",
                                    textUnderlineOffset: 4,
                                }}
                            >
                                CONTINUE GAME
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
