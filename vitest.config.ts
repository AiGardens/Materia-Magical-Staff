/**
 * Flowerbed — Vitest Configuration
 * Unit and integration tests for utility functions, Zod schemas, and lib code.
 * Run with: npm run test:unit
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "node",
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        exclude: ["**/node_modules/**", "**/tests/**"],
        globals: true,
        coverage: {
            reporter: ["text", "json", "html"],
            include: ["src/lib/**"],
        },
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
});
