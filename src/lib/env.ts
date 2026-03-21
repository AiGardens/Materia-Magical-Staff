/**
 * Materia Magical Staff — Fail-Fast Environment Validation
 * Guardrail: All env vars MUST be declared here. App refuses to start if any required
 * secret is missing. Import this file in layout.tsx to validate on every cold start.
 */
import { z } from "zod";

const envSchema = z.object({
  // ── Core ──────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // ── Database ──────────────────────────────────────────────
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),

  // ── Better Auth ───────────────────────────────────────────
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL"),

  // ── App Public URL ────────────────────────────────────────
  // Used to construct public eBay image URLs: https://{domain}/uploads/{filename}
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL"),

  // ── eBay OAuth ────────────────────────────────────────────
  EBAY_CLIENT_ID: z.string().min(1, "EBAY_CLIENT_ID is required"),
  EBAY_CLIENT_SECRET: z.string().min(1, "EBAY_CLIENT_SECRET is required"),
  EBAY_REFRESH_TOKEN: z.string().min(1, "EBAY_REFRESH_TOKEN is required"),
  EBAY_MARKETPLACE_ID: z.string().default("EBAY_US"),
  EBAY_MERCHANT_LOCATION_KEY: z
    .string()
    .min(1, "EBAY_MERCHANT_LOCATION_KEY is required"),

  // ── Google Gemini ─────────────────────────────────────────
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

  // ── Email (Resend) — Optional ─────────────────────────────
  // Not required for core functionality.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // ── Seed Script — Optional ─────────────────────────────
  // Used by prisma/seed.ts to bootstrap the single admin user.
  SEED_USER_EMAIL: z.string().email().optional(),
  SEED_USER_PASSWORD: z.string().min(8).optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("❌ FATAL: Invalid environment variables detected:");
  console.error(result.error.flatten().fieldErrors);
  throw new Error(
    "Invalid environment configuration. Check your .env file and the schema in src/lib/env.ts."
  );
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;
