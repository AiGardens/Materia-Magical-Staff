import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker multi-stage deployment (see Dockerfile)
  output: "standalone",

  // Packages that must run on the server (not bundled by webpack)
  serverExternalPackages: ["@prisma/client", "better-auth"],

  // Enable type-safe route strings when routes are finalized
  // typedRoutes: true,
};

export default nextConfig;
