/**
 * Materia Magical Staff — Image Upload API
 *
 * POST /api/upload
 * Accepts multipart/form-data with one or more files under field "files".
 * Saves each file to /public/uploads/{uuid}.{ext} using Node fs (no external libs).
 * Returns the public-facing URLs for use in the gallery and in eBay API payloads.
 *
 * Auth: required (401 if no session).
 * Max file size: 20 MB per file.
 * Accepted types: JPEG, PNG, WebP, HEIC, HEIF.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const ACCEPTED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Map MIME type → extension (fallback for files with wrong/missing extension)
const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
};

export async function POST(request: NextRequest) {
    // ── Auth gate ────────────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse multipart form ─────────────────────────────────────────────────
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Invalid multipart/form-data payload." },
            { status: 400 }
        );
    }

    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
        return NextResponse.json(
            { error: "No files provided. Send files under the 'files' field." },
            { status: 400 }
        );
    }

    // ── Ensure upload directory exists ───────────────────────────────────────
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    // ── Process each file ────────────────────────────────────────────────────
    const uploads: { id: string; url: string; filename: string }[] = [];
    const errors: string[] = [];

    for (const file of files) {
        // Type check
        if (!ACCEPTED_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: "Unsupported image format. Please upload PNG, JPEG, WEBP, HEIC, or HEIF files." },
                { status: 400 }
            );
        }

        // Size check
        if (file.size > MAX_FILE_SIZE) {
            errors.push(
                `"${file.name}" rejected: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds 20 MB limit.`
            );
            continue;
        }

        // Determine extension — prefer the MIME type mapping over the original filename
        // to prevent extension spoofing.
        const ext = MIME_TO_EXT[file.type] ?? extname(file.name) ?? ".jpg";
        const id = randomUUID();
        const filename = `${id}${ext}`;
        const filePath = join(uploadDir, filename);

        // Write to disk
        const bytes = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(bytes));

        // ── Mirror to VPS (local dev only) ───────────────────────────────────
        // If MIRROR_SECRET is set, push the file to the VPS so eBay can fetch
        // it at the public domain URL (NEXT_PUBLIC_APP_URL/uploads/filename).
        // This replaces the ngrok tunnel — no tunnel software needed.
        // Non-blocking: a mirror failure never fails the local upload.
        const mirrorSecret = process.env.MIRROR_SECRET;
        if (mirrorSecret) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
            const mirrorUrl = `${appUrl}/api/internal/mirror-upload`;
            try {
                const mirrorForm = new FormData();
                mirrorForm.append(
                    "file",
                    new Blob([bytes], { type: file.type }),
                    filename
                );
                const mirrorRes = await fetch(mirrorUrl, {
                    method: "POST",
                    headers: { "x-mirror-secret": mirrorSecret },
                    body: mirrorForm,
                });
                if (mirrorRes.ok) {
                    console.log(`[mirror-upload] ✓ ${filename}`);
                } else {
                    console.warn(
                        `[mirror-upload] ⚠ ${filename} — VPS returned HTTP ${mirrorRes.status}`
                    );
                }
            } catch (err) {
                console.warn(`[mirror-upload] ⚠ ${filename} — ${err}`);
            }
        }

        uploads.push({
            id,
            url: `/uploads/${filename}`,
            filename,
        });
    }

    // ── Return result ────────────────────────────────────────────────────────
    if (uploads.length === 0) {
        return NextResponse.json(
            { error: "All files were rejected.", details: errors },
            { status: 400 }
        );
    }

    return NextResponse.json(
        { uploads, errors: errors.length > 0 ? errors : undefined },
        { status: 200 }
    );
}
