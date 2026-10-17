import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/page-metadata";
import { getSiteSettings } from "@/lib/site-settings";

// The page is a client component, which can't name itself in the tab.
export const metadata: Metadata = { title: `Sign Up · ${SITE_NAME}` };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();

  return (
    <div>
      {!settings.registrationOpen && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs font-medium text-amber-300"
        >
          Public registration is currently closed. New account creations are temporarily disabled.
        </div>
      )}
      {children}
    </div>
  );
}
