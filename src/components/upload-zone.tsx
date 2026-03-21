"use client";

/**
 * Materia Magical Staff — Upload Zone
 *
 * Drag-and-drop + click-to-select image uploader.
 * Sends files to POST /api/upload and adds results to the GalleryProvider.
 *
 * Supports: JPEG, PNG, WebP, GIF, AVIF. Max 20 MB per file.
 * Uses XMLHttpRequest for progress events.
 */

import { useRef, useState, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { useGallery } from "@/lib/gallery-store";
import type { ImageItem } from "@/types";

interface UploadProgress {
    filename: string;
    percent: number;
}

export function UploadZone() {
    const { addImages } = useGallery();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<UploadProgress[]>([]);
    const [errors, setErrors] = useState<string[]>([]);

    // ── Upload logic ─────────────────────────────────────────────────────────
    const uploadFiles = useCallback(
        async (files: FileList | File[]) => {
            const fileArray = Array.from(files).filter(f =>
                f.type.startsWith("image/")
            );
            if (fileArray.length === 0) return;

            setUploading(true);
            setErrors([]);
            setProgress(fileArray.map(f => ({ filename: f.name, percent: 0 })));

            const newUploads: ImageItem[] = [];
            const newErrors: string[] = [];

            // Upload files concurrently but individually to avoid massive payloads
            await Promise.all(
                fileArray.map(file => {
                    return new Promise<void>((resolve) => {
                        const formData = new FormData();
                        formData.append("files", file);

                        const xhr = new XMLHttpRequest();

                        xhr.upload.addEventListener("progress", (e) => {
                            if (e.lengthComputable) {
                                const pct = Math.round((e.loaded / e.total) * 100);
                                setProgress(prev =>
                                    prev.map(p =>
                                        p.filename === file.name ? { ...p, percent: pct } : p
                                    )
                                );
                            }
                        });

                        xhr.addEventListener("load", () => {
                            try {
                                const data: {
                                    uploads?: ImageItem[];
                                    errors?: string[];
                                    error?: string;
                                } = JSON.parse(xhr.responseText);

                                if (data.uploads?.length) {
                                    newUploads.push(...data.uploads);
                                }
                                if (data.errors?.length) {
                                    newErrors.push(...data.errors);
                                } else if (data.error) {
                                    newErrors.push(data.error);
                                }
                            } catch {
                                newErrors.push(`Failed to process ${file.name}`);
                            }
                            resolve();
                        });

                        xhr.addEventListener("error", () => {
                            newErrors.push(`Network error uploading ${file.name}. Try again.`);
                            resolve();
                        });

                        xhr.open("POST", "/api/upload");
                        xhr.send(formData);
                    });
                })
            );

            if (newUploads.length > 0) {
                addImages(newUploads);
            }
            if (newErrors.length > 0) {
                setErrors(newErrors);
            }

            setUploading(false);
            setProgress([]);
        },
        [addImages]
    );

    // ── Document-level drop guard ────────────────────────────────────────────
    // Catches files dropped anywhere on the page — prevents the browser from
    // opening them in a new tab, and processes them as uploads instead.
    useEffect(() => {
        const handleDocDragOver = (e: globalThis.DragEvent) => {
            // Only intercept real file drags from the OS (not internal D&D)
            if (e.dataTransfer?.types.includes("Files")) {
                e.preventDefault();
            }
        };

        const handleDocDrop = (e: globalThis.DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                uploadFiles(e.dataTransfer.files);
            }
        };

        document.addEventListener("dragover", handleDocDragOver);
        document.addEventListener("drop", handleDocDrop);

        return () => {
            document.removeEventListener("dragover", handleDocDragOver);
            document.removeEventListener("drop", handleDocDrop);
        };
    }, [uploadFiles]);

    // ── Drag-and-drop handlers ───────────────────────────────────────────────
    const onDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const onDragLeave = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const onDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            await uploadFiles(e.dataTransfer.files);
        }
    };

    // ── File input handler ───────────────────────────────────────────────────
    const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await uploadFiles(e.target.files);
            // Reset so same file can be re-selected if needed
            e.target.value = "";
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ marginBottom: "2rem" }}>
            {/* Drop Zone / Upload Portal */}
            <div
                className={`upload-portal${isDragOver ? " upload-portal-active" : ""}${uploading ? " upload-portal-uploading" : ""}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !uploading && inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload images — drag and drop or click to select"
                onKeyDown={e => e.key === "Enter" && !uploading && inputRef.current?.click()}
            >
                {/* Hidden file input */}
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    style={{ display: "none" }}
                    onChange={onFileChange}
                    id="upload-file-input"
                />

                {uploading ? (
                    /* Upload progress state */
                    <div style={{ textAlign: "center" }}>
                        <div
                            className="retro-title"
                            style={{ fontSize: 12, marginBottom: "1rem" }}
                        >
                            UPLOADING {progress.length} FILE{progress.length !== 1 ? "S" : ""}
                            <span className="blink">...</span>
                        </div>
                        {progress.map((p, i) => (
                            <div key={i} style={{ marginBottom: 8, maxWidth: 400, margin: "0 auto 8px" }}>
                                <div
                                    className="retro-body-text"
                                    style={{ fontSize: 14, color: "var(--retro-muted)", marginBottom: 4, textAlign: "left" }}
                                >
                                    {p.filename.length > 32 ? p.filename.slice(0, 29) + "..." : p.filename}
                                </div>
                                <div className="pixel-progress-track">
                                    <div
                                        className="pixel-progress-fill"
                                        style={{ width: `${p.percent}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Idle state */
                    <div className="rune-ring-container">
                        <div className="rune-ring-spin" />

                        <div className="portal-content">
                            {/* Title text */}
                            <div className="retro-title portal-title-text" style={{ fontSize: 18, marginBottom: "0.25rem", color: isDragOver ? "var(--retro-yellow)" : "#ffffff" }}>
                                Upload Portal
                            </div>

                            {/* Down Arrow Indicator */}
                            <div
                                style={{
                                    fontSize: 32,
                                    lineHeight: 1,
                                    marginBottom: "0.5rem",
                                    color: isDragOver ? "var(--retro-yellow)" : "#ffffff",
                                    transition: "color 150ms ease",
                                }}
                            >
                                ⬇
                            </div>

                            <div
                                className="retro-title"
                                style={{ fontSize: isDragOver ? 14 : 12, marginBottom: "0.5rem", color: "#ffffff" }}
                            >
                                {isDragOver ? "RELEASE TO UPLOAD" : "DROP FILES HERE"}
                            </div>
                            <div
                                className="retro-body-text"
                                style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold", lineHeight: 1.4 }}
                            >
                                DRAG FILES TO PORTAL OR CLICK TO BROWSE<br />
                                <span style={{ fontSize: 11, color: "#ffffff", marginTop: 4, display: "block", fontWeight: "bold" }}>
                                    JPG · PNG · WEBP · GIF · AVIF · MAX 20 MB EACH
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Upload errors */}
            {errors.length > 0 && (
                <div
                    style={{
                        marginTop: "1rem",
                        padding: "12px 16px",
                        border: "3px solid var(--retro-red)",
                        background: "rgba(255, 55, 55, 0.08)",
                    }}
                >
                    {errors.map((err, i) => (
                        <div
                            key={i}
                            className="retro-error"
                            style={{ fontSize: 9, marginBottom: i < errors.length - 1 ? 6 : 0 }}
                        >
                            ⚠ {err.toUpperCase()}
                        </div>
                    ))}
                    <button
                        className="pixel-btn pixel-btn-sm"
                        style={{ marginTop: 8, fontSize: 8 }}
                        onClick={() => setErrors([])}
                    >
                        DISMISS
                    </button>
                </div>
            )}
        </div>
    );
}
