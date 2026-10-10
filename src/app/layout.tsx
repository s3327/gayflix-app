import type { Metadata } from "next";
import { connection } from "next/server";
import { Baloo_2, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime request to Google Fonts,
// no layout shift. Exposed as CSS variables and mapped in tailwind.config.ts
// under fontFamily.display / fontFamily.body.
const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Gayflix — Love. Stories. Ours.",
  description: "LGBTQ+ stories, films, and series — picked by our community.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every page is rendered per request: the Content-Security-Policy set
  // by src/proxy.ts carries a fresh nonce, and Next.js can only stamp it
  // onto its scripts at request time. A prerendered (static) page would
  // ship scripts without the nonce, and the browser would block them.
  await connection();

  return (
    <html lang="en" className={`${baloo.variable} ${inter.variable}`}>
      <body className="bg-bg-base text-ink-primary font-body antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
