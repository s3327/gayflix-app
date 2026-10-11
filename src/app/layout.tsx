import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthProvider } from "@/lib/auth-context";
import { siteUrl } from "@/lib/site-url";
import { fontVariables } from "./fonts";
import "./globals.css";

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
    <html lang="en" className={fontVariables}>
      <body className="bg-bg-base text-ink-primary font-body antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
