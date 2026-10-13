"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@sentry/nextjs";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin error]", error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN && !error.digest) captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
      <div className="max-w-md rounded-card border border-border-subtle bg-bg-surface p-8">
        <h1 className="font-display text-2xl font-bold text-ink-primary">Something went wrong</h1>
        <p className="mt-3 text-sm text-ink-secondary">
          {error.message || "An unexpected error occurred while loading this admin page."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light"
          >
            Try again
          </button>
          <Link
            href="/admin/dashboard"
            className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

