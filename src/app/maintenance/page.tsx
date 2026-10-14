import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Wrench, Mail } from "lucide-react";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Under Maintenance · Gayflix",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const settings = await getSiteSettings();

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col justify-between p-6 sm:p-12">
      <div className="flex items-center gap-3">
        <Image
          src="/brand/gayflix-icon.png"
          alt={settings.siteTitle}
          width={40}
          height={40}
          className="rounded-md"
        />
        <span className="font-display text-xl font-bold tracking-tight text-ink-primary">
          {settings.siteTitle}
        </span>
      </div>

      <main className="mx-auto max-w-lg text-center py-12">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-status-warning/15 text-status-warning border border-status-warning/30">
          <Wrench className="h-8 w-8" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Scheduled Maintenance
        </h1>
        <p className="mt-4 text-base text-ink-secondary leading-relaxed">
          {settings.siteTitle} is currently undergoing scheduled platform updates and improvements.
          We will be back online shortly. Thank you for your patience!
        </p>

        {settings.contactEmail && (
          <div className="mt-8 flex justify-center">
            <a
              href={`mailto:${settings.contactEmail}`}
              className="inline-flex items-center gap-2 rounded-card border border-border-strong bg-bg-surface px-4 py-2 text-sm font-semibold text-ink-primary hover:bg-bg-elevated transition-colors"
            >
              <Mail className="h-4 w-4 text-brand-pink" />
              Contact Support
            </a>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-ink-muted">
        &copy; {new Date().getFullYear()} {settings.siteTitle}. All rights reserved. ·{" "}
        <Link href="/admin/login" className="hover:text-ink-brand underline">
          Admin Sign-In
        </Link>
      </footer>
    </div>
  );
}
