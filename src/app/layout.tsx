/**
 * Flowerbed — Root Layout
 * - Imports env.ts to trigger fail-fast validation on every cold start
 * - Injects Plausible analytics script if NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set
 * - Includes JSON-LD structured data for AI/bot legibility
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { JsonLd } from "@/components/seo/JsonLd";

// ── Fail-fast env validation — runs on every cold start ─────────
import "@/lib/env";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Flowerbed",
    template: "%s | Flowerbed",
  },
  description:
    "A production-grade Next.js template — the AI Gardens Elite Web Pipeline.",
  robots: {
    index: false, // Template default: do NOT index. Override per project.
    follow: false,
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Flowerbed",
  description: "Production-grade Next.js template by AI Gardens.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  return (
    <html lang="en">
      <head>
        <JsonLd data={websiteJsonLd} />
        {/* Plausible Analytics — injected only when domain is configured */}
        {plausibleDomain && (
          <script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
