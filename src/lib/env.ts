/**
 * Flowerbed — Fail-Fast Environment Validation
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

  // ── Email (Resend) ────────────────────────────────────────
  RESEND_API_KEY: z
    .string()
    .startsWith("re_", "RESEND_API_KEY must start with 're_'"),
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email address"),

  // ── Background Jobs (Trigger.dev) ─────────────────────────
  TRIGGER_SECRET_KEY: z
    .string()
    .min(1, "TRIGGER_SECRET_KEY is required"),

  // ── Error Monitoring (Sentry) ─────────────────────────────
  SENTRY_DSN: z.string().url("SENTRY_DSN must be a valid URL").optional(),

  // ── Analytics (Plausible) ─────────────────────────────────
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().optional(),
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
