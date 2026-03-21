/**
 * Materia Magical Staff — Root Layout
 * Loads retro Google Fonts + fail-fast env validation on every cold start.
 */
import type { Metadata } from "next";
import { Press_Start_2P, VT323, Cinzel, Inter, Macondo, MedievalSharp } from "next/font/google";
import "./globals.css";
// ── Fail-fast env validation — runs on every cold start ─────────
import "@/lib/env";
import { ThemeProvider } from "@/components/theme-provider";

const pressStart2P = Press_Start_2P({
  weight: "400",
  variable: "--font-press-start",
  subsets: ["latin"],
});

const vt323 = VT323({
  weight: "400",
  variable: "--font-vt323",
  subsets: ["latin"],
});

// New Fonts for Late 90s RPG theme
const cinzel = Cinzel({
  weight: ["400", "700"],
  variable: "--font-cinzel",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// New Fonts for Adventure Theme
const macondo = Macondo({
  weight: "400",
  variable: "--font-macondo",
  subsets: ["latin"],
});

const medievalSharp = MedievalSharp({
  weight: "400",
  variable: "--font-medieval",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Materia Magical Staff",
    template: "%s | Materia Magical Staff",
  },
  description:
    "The bulk eBay listing engine for professional resellers. Powered by AI.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${pressStart2P.variable} ${vt323.variable} ${cinzel.variable} ${inter.variable} ${macondo.variable} ${medievalSharp.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="theme-early-90s"
          themes={["theme-early-90s", "theme-late-90s", "theme-adventure"]}
          enableSystem={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
