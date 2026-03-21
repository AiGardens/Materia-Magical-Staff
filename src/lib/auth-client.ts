/**
 * Materia Magical Staff — Better Auth (Client-Side Configuration)
 * Safe to import in Client Components and the browser.
 * For server-side actions/API routes, use `auth.ts` instead.
 *
 * Auth strategy: email + password only. No magic link, no email verification.
 */
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const {
    signIn,
    signOut,
    signUp,
    useSession,
} = authClient;
