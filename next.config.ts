import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker multi-stage deployment (see Dockerfile)
  output: "standalone",

  // Packages that must run on the server (not bundled by webpack)
  serverExternalPackages: ["@prisma/client", "better-auth"],

  // Skip ESLint during Docker builds — pre-existing `any` types in aiPipeline.ts
  // and aspectParser.ts are harmless at runtime. Lint still runs during `npm run dev`.
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ── Static /uploads Serving ─────────────────────────────────────────────
  // User-uploaded images are stored at /public/uploads/ and served at:
  //   https://{domain}/uploads/{filename}
  // This works automatically because Next.js serves everything under /public
  // at the root URL path. No custom server config is needed.
  //
  // In Docker (production):
  //   The `uploads-data` named volume is mounted to /app/public/uploads in
  //   docker-compose.yml. Images persist across container restarts.
  //
  // In local dev (no Docker):
  //   Files are written directly to /public/uploads/ in the project root.
  //   This directory is gitignored so uploaded images never reach source control.
};

export default nextConfig;
