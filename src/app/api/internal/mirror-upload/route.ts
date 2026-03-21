/**
 * Materia Magical Staff — Internal Image Mirror Endpoint
 *
 * POST /api/internal/mirror-upload
 *
 * Server-to-server only. Used by local dev machines to mirror uploaded images
 * to the VPS so eBay can fetch them at the public domain URL
 * (https://magicalstaff.aigardens.life/uploads/{filename}).
 *
 * Auth: x-mirror-secret header must match MIRROR_SECRET env var.
 * No user session required — the shared secret IS the auth.
 *
 * Body: multipart/form-data with a single "file" field containing the image.
 * The filename in the form field is used as-is (must match the UUID filename
 * already chosen by the sender — no renaming here).
 *
 * Why this exists:
 *   When developing locally, images are saved to the Mac's public/uploads/.
 *   eBay's API requires image URLs to be publicly reachable. Instead of ngrok,
 *   we mirror every uploaded file to the VPS. NEXT_PUBLIC_APP_URL points to
 *   the VPS, so all eBay image URLs are automatically valid.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
    // ── Auth: shared secret ──────────────────────────────────────────────────
    const mirrorSecret = process.env.MIRROR_SECRET;
    if (!mirrorSecret) {
        // MIRROR_SECRET not configured on this server — mirror endpoint disabled
        return NextResponse.json(
            { error: "Mirror endpoint is not configured on this server." },
            { status: 503 }
        );
    }

    const incomingSecret = request.headers.get("x-mirror-secret");
    if (incomingSecret !== mirrorSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse form data ──────────────────────────────────────────────────────
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Invalid multipart/form-data payload." },
            { status: 400 }
        );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
        return NextResponse.json(
            { error: "No file provided. Send the image under the 'file' field." },
            { status: 400 }
        );
    }

    // ── Size guard ───────────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
            {
                error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds 20 MB limit.`,
            },
            { status: 413 }
        );
    }

    // ── Save file using the exact filename from the caller ───────────────────
    // The sender already assigned the UUID filename when it saved locally.
    // We must use the same name so the URL matches on both sides.
    const filename = file.name;
    if (!filename || filename.includes("/") || filename.includes("..")) {
        return NextResponse.json(
            { error: "Invalid filename." },
            { status: 400 }
        );
    }

    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const filePath = join(uploadDir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    console.log(`[mirror-upload] ✓ Saved ${filename} (${(file.size / 1024).toFixed(1)} KB)`);

    return NextResponse.json({ ok: true, filename }, { status: 200 });
}
