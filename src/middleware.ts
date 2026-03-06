/**
 * Flowerbed — Middleware "Bouncer"
 * Guardrail: DEFAULT-DENY. All routes require auth unless explicitly whitelisted.
 * Public routes: /, /login, /signup, /api/auth/**, /api/bot/**, and Next.js internals.
 */
import { NextRequest, NextResponse } from "next/server";
import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "@/lib/auth";

// ── Public Route Whitelist ───────────────────────────────────────
const PUBLIC_PATHS = [
    "/",
    "/login",
    "/signup",
    "/api/auth",   // Better Auth routes
    "/api/bot",    // Bot Gateway (intentionally public for AI agents)
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(
        (path) => pathname === path || pathname.startsWith(path + "/")
    );
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public routes through
    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    // Validate session via Better Auth
    const { data: session } = await betterFetch<Session>(
        "/api/auth/get-session",
        {
            baseURL: request.nextUrl.origin,
            headers: {
                cookie: request.headers.get("cookie") ?? "",
            },
        }
    );

    // No valid session → redirect to login, preserving intended destination
    if (!session) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
