/**
 * Flowerbed — Playwright Configuration
 * End-to-end tests simulating real users in a browser.
 * Run with: npm run test:e2e
 * 
 * Smoke tests verify the "happy path" — the most critical user flows.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false, // Run sequentially for predictable auth state
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",

    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    // Start the Next.js dev server before running tests
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
