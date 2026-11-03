import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { AuthProvider } from "@/lib/auth-context";
import { OPEN_GRAPH, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, TWITTER } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/site-url";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },

  description: SITE_DESCRIPTION,
  openGraph: OPEN_GRAPH,
  twitter: TWITTER,
  // Added to an iPhone's home screen, it opens full screen as "Gayflix"
  // (the manifest, src/app/manifest.ts, does this for everything else).
  appleWebApp: { capable: true, title: "Gayflix", statusBarStyle: "black-translucent" },



};

/** The browser's own bars match the page when installed or on a phone. */
export const viewport: Viewport = {
  themeColor: "#0b0b0f",
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
