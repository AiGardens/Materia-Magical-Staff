/**
 * Flowerbed — Auth Flow Smoke Test (Playwright E2E)
 * Tests the "Happy Path" for authentication — the most critical user flow.
 * Verifies: public routes accessible, protected routes redirect, login page renders.
 */
import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
    test("homepage is publicly accessible", async ({ page }) => {
        await page.goto("/");
        expect(page.url()).toContain("localhost:3000");
        // Should NOT redirect to /login
        expect(page.url()).not.toContain("/login");
    });

    test("login page is publicly accessible", async ({ page }) => {
        await page.goto("/login");
        expect(page.url()).toContain("/login");
        // Should render without redirect loop
        await expect(page).toHaveTitle(/.+/);
    });

    test("protected route /dashboard redirects unauthenticated user to /login", async ({
        page,
    }) => {
        await page.goto("/dashboard");
        // Middleware bouncer should redirect to /login
        await page.waitForURL("**/login**");
        expect(page.url()).toContain("/login");
        expect(page.url()).toContain("callbackUrl");
    });

    test("bot gateway /api/bot/example is publicly accessible", async ({
        page,
    }) => {
        const response = await page.request.get("/api/bot/example");
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json["@type"]).toBe("WebAPI");
    });
});
