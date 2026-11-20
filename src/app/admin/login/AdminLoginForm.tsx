"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import TwoFactorForm from "@/components/TwoFactorForm";
import { signInToAdmin } from "@/lib/auth-actions";
import { isActionRedirect } from "@/lib/auth-redirects";
import { safeAdminNextPath } from "@/lib/safe-redirect";

/**
 * The admin log-in form. Signs in on the server (signInToAdmin in
 * src/lib/auth-actions.ts), which refuses accounts without a staff role
 * and sends staff on to `nextUrl` (an admin page) or the dashboard;
 * staff without two-factor are sent from there to set it up when it's
 * required. Staff with two-factor get the code step (TwoFactorForm).
 */
export default function AdminLoginForm({ nextUrl }: { nextUrl?: string }) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const destination = safeAdminNextPath(nextUrl);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setIsSubmitting(true);
    let result: Awaited<ReturnType<typeof signInToAdmin>>;
    try {
      result = await signInToAdmin(String(form.get("email")), String(form.get("password")), destination);
    } catch (thrown) {
      // Signed in: the server is sending the browser to `destination`.
      if (isActionRedirect(thrown)) return;
      setIsSubmitting(false);
      throw thrown;
    }
    setIsSubmitting(false);

    if ("needsEmailCode" in result) {
      setError("Confirm this account's email first: log in on the main site to get a code.");
      return;
    }
    if ("needsTwoFactor" in result) {
      setNeedsTwoFactor(true);
      return;
    }
    setError(result.error);
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
            Sign in to manage Gayflix. Admin sign-ins last 12 hours.
          </p>
        </div>

        {needsTwoFactor ? (
          <TwoFactorForm
            next={destination}
            startOverPath={`/admin/login?${new URLSearchParams({ next: destination })}`}
            onStartOver={() => setNeedsTwoFactor(false)}
          />
        ) : (
          <form method="post" onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-5">
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
                className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
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
                  href="/forgot-password"
                  className="text-xs font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
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
                className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
              />
            </div>

            <FormError message={error} />

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-wait disabled:opacity-70"
            >
              {isSubmitting ? "Logging In…" : "Log In"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

