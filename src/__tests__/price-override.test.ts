/**
 * Materia Magical Staff — Price Override Unit Tests
 *
 * Tests the extractPriceOverride() pure function from gallery-store.tsx.
 * Run with: npm run test:unit
 */
import { describe, it, expect } from "vitest";
import { extractPriceOverride } from "@/lib/gallery-store";

describe("extractPriceOverride", () => {
    // ── Dollar-prefix patterns ────────────────────────────────────────────
    it('parses "$35" → 35', () => {
        expect(extractPriceOverride("$35")).toBe(35);
    });

    it('parses "$35.50" → 35.5', () => {
        expect(extractPriceOverride("$35.50")).toBe(35.5);
    });

    it('parses "$ 40" (with space after $) → 40', () => {
        expect(extractPriceOverride("$ 40")).toBe(40);
    });

    it('parses "asking $120 firm" (embedded in string) → 120', () => {
        expect(extractPriceOverride("asking $120 firm")).toBe(120);
    });

    it('parses "mint condition, $40" → 40', () => {
        expect(extractPriceOverride("mint condition, $40")).toBe(40);
    });

    // ── Dollar-suffix patterns ────────────────────────────────────────────
    it('parses "35$" → 35', () => {
        expect(extractPriceOverride("35$")).toBe(35);
    });

    it('parses "35.99$" → 35.99', () => {
        expect(extractPriceOverride("35.99$")).toBe(35.99);
    });

    // ── CAD / dollars patterns ────────────────────────────────────────────
    it('parses "40 CAD" → 40', () => {
        expect(extractPriceOverride("40 CAD")).toBe(40);
    });

    it('parses "$40 CAD" → 40 (dollar prefix wins)', () => {
        expect(extractPriceOverride("$40 CAD")).toBe(40);
    });

    it('parses "50 dollars" → 50', () => {
        expect(extractPriceOverride("50 dollars")).toBe(50);
    });

    it('parses "50 dollar" (singular) → 50', () => {
        expect(extractPriceOverride("50 dollar")).toBe(50);
    });

    it('parses case-insensitive "40 cad" → 40', () => {
        expect(extractPriceOverride("40 cad")).toBe(40);
    });

    // ── No match patterns ─────────────────────────────────────────────────
    it('returns null for "mint condition"', () => {
        expect(extractPriceOverride("mint condition")).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(extractPriceOverride("")).toBeNull();
    });

    it('returns null for "50 bucks" (unsupported currency word)', () => {
        expect(extractPriceOverride("50 bucks")).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(extractPriceOverride("   ")).toBeNull();
    });

    it('returns null for a plain number with no currency indicator', () => {
        expect(extractPriceOverride("1998 collector edition")).toBeNull();
    });

    it('returns null for "missing one piece"', () => {
        expect(extractPriceOverride("missing one piece")).toBeNull();
    });
});
