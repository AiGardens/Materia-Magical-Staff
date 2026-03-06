/**
 * Flowerbed — Better Auth (Client-Side Configuration)
 * Safe to import in Client Components and the browser.
 * For server-side actions/API routes, use `auth.ts` instead.
 */
"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    plugins: [magicLinkClient()],
});

export const {
    signIn,
    signOut,
    signUp,
    useSession,
} = authClient;
