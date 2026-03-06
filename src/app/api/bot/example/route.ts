/**
 * Flowerbed — Bot Gateway: Example Endpoint
 * Guardrail: Machine legibility is first-class. This endpoint returns structured,
 * optimized JSON specifically designed for AI agent consumption (e.g., OpenClaw).
 * 
 * All /api/bot/* endpoints are intentionally PUBLIC (see middleware.ts whitelist).
 * They return pure JSON with no HTML overhead — ideal for web crawlers and AI agents.
 */
import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        // Schema descriptor tells AI agents what this API can do
        "@context": "https://schema.org",
        "@type": "WebAPI",
        name: "Flowerbed Bot Gateway",
        description:
            "High-efficiency JSON API for AI agent consumption. Structured data, no HTML overhead.",
        version: "1.0.0",
        endpoints: [
            {
                path: "/api/bot/example",
                method: "GET",
                description: "Returns this API schema manifest.",
                returns: "WebAPI schema",
            },
        ],
        capabilities: {
            authentication: "None required for /api/bot/* endpoints",
            rateLimit: "Standard rate limiting applies",
            format: "application/json",
        },
        contact: {
            "@type": "Organization",
            name: "ai gardens",
        },
    });
}
