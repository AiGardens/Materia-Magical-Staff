/**
 * Materia Magical Staff — Better Auth (Server-Side Configuration)
 * Guardrail: This is the server-side auth config. Never import this in client components.
 * Use `auth-client.ts` for client-side usage.
 *
 * Auth strategy: email + password only. No email verification, no magic link, no Resend.
 * This is a single-user tool — sign-in is immediate after account creation.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql",
    }),

    emailAndPassword: {
        enabled: true,
        // No email verification — single-user tool, sign in immediately
        requireEmailVerification: false,
    },

    trustedOrigins: [process.env.BETTER_AUTH_URL!],
});

export type Session = typeof auth.$Infer.Session;
