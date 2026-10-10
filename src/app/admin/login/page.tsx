"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Admin sign-in UI. There are no admin accounts yet, so submitting only
 * explains that; access to the panel is currently controlled by the
 * password prompt the proxy shows (see src/lib/admin-auth.ts).
 *
 * The form must never fall back to a native GET submit — that would put
 * the password in the URL (history, server logs, Referer headers). So it
 * prevents the default submit, and declares method="post" for the case
 * where JavaScript hasn't loaded.
 */
export default function AdminLoginPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm rounded-card border border-border-subtle bg-bg-surface p-8">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/brand/gayflix-icon.png"
            alt="Gayflix"
            width={500}
            height={500}
            priority
            className="h-10 w-10"
          />
          <h1 className="mt-4 font-display text-2xl font-bold">
            Admin Login
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in to manage Gayflix
          </p>
        </div>

        <form method="post" onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="you@gayflix.com"
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
              >
                Password
              </label>
              <Link
                href="/admin/forgot-password"
                className="text-xs font-medium text-brand-pink transition-colors hover:text-brand-pink-light"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-none"
            />
          </div>

          <button
            type="submit"
            className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            Log In
          </button>

          {submitted && (
            <p role="status" className="text-center text-sm text-ink-secondary">
              Admin accounts aren&apos;t set up yet. Access is currently
              protected by the site&apos;s admin password prompt.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
