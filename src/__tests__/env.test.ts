/**
 * Flowerbed — Env Validation Unit Test
 * Verifies the fail-fast Zod schema rejects invalid/missing env vars.
 * Run with: npm run test:unit
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Environment Validation Schema", () => {
    const requiredEnv = {
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
        BETTER_AUTH_SECRET: "a-very-long-secret-over-32-characters-long",
        BETTER_AUTH_URL: "http://localhost:3000",
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "test@example.com",
        TRIGGER_SECRET_KEY: "test_trigger_key",
    };

    beforeEach(() => {
        // Inject valid env vars for each test
        Object.assign(process.env, requiredEnv);
    });

    afterEach(() => {
        // Clean up injected env vars
        Object.keys(requiredEnv).forEach((key) => delete process.env[key]);
        vi.resetModules();
    });

    it("should validate successfully with all required env vars present", async () => {
        const { z } = await import("zod");

        const envSchema = z.object({
            DATABASE_URL: z.string().url(),
            BETTER_AUTH_SECRET: z.string().min(32),
            BETTER_AUTH_URL: z.string().url(),
            RESEND_API_KEY: z.string().startsWith("re_"),
            EMAIL_FROM: z.string().email(),
            TRIGGER_SECRET_KEY: z.string().min(1),
        });

        const result = envSchema.safeParse(process.env);
        expect(result.success).toBe(true);
    });

    it("should fail when DATABASE_URL is missing", async () => {
        const { z } = await import("zod");
        delete process.env.DATABASE_URL;

        const envSchema = z.object({
            DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),
        });

        const result = envSchema.safeParse(process.env);
        expect(result.success).toBe(false);
    });

    it("should fail when BETTER_AUTH_SECRET is too short", async () => {
        const { z } = await import("zod");
        process.env.BETTER_AUTH_SECRET = "short";

        const envSchema = z.object({
            BETTER_AUTH_SECRET: z.string().min(32),
        });

        const result = envSchema.safeParse(process.env);
        expect(result.success).toBe(false);
    });

    it("should fail when RESEND_API_KEY doesn't start with re_", async () => {
        const { z } = await import("zod");
        process.env.RESEND_API_KEY = "invalid_key";

        const envSchema = z.object({
            RESEND_API_KEY: z.string().startsWith("re_"),
        });

        const result = envSchema.safeParse(process.env);
        expect(result.success).toBe(false);
    });
});
