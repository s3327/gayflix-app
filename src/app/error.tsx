"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-4xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-ink-secondary">
        Sorry about that. Try again, or head back home.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-card bg-brand-pink px-7 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
        >
          Try Again
        </button>
        <Link
          href="/home"
          className="rounded-card border border-border-strong px-7 py-3 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
