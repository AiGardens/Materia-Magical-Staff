/**
 * POST /api/pipeline
 *
 * Processes a single cluster through the full 4-step AI pipeline.
 * Called once per cluster by the client ProcessingScreen.
 *
 * Request body: { cluster: Cluster, globalPrefs: { acceptOffers, autoAcceptThreshold }, modelOverride?: "flash" | "pro" }
 * Response: { listing: ListingObject } on success, { error: string } on failure.
 *
 * Auth-gated — requires an active session.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { runPipeline } from "@/lib/aiPipeline";
import type { Cluster } from "@/types";

export async function POST(req: NextRequest) {
    // ── Auth gate ─────────────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: {
        cluster: Cluster;
        globalPrefs: { acceptOffers: boolean; autoAcceptThreshold: number | null };
        modelOverride?: "flash" | "pro";
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { cluster, globalPrefs, modelOverride } = body;

    if (!cluster || !cluster.id || !Array.isArray(cluster.images)) {
        return NextResponse.json({ error: "cluster is missing or malformed" }, { status: 400 });
    }

    // ── Determine app URL (for building absolute image URLs) ──────────────────
    // In Docker production this comes from NEXT_PUBLIC_APP_URL.
    // In local dev we fall back to localhost:3000.
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";

    // ── Run pipeline ──────────────────────────────────────────────────────────
    try {
        const result = await runPipeline({ cluster, appUrl, globalPrefs, modelOverride });
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown pipeline error";
        console.error("[/api/pipeline] Pipeline error:", message, err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
