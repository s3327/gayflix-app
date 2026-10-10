"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import TwoFactorForm from "@/components/TwoFactorForm";
import { authClient, authErrorMessage } from "@/lib/auth-client";

/**
 * Admin sign-in. Admins use the same accounts as the public site; what
 * makes one an admin is the "admin" role (granted with
 * `npm run make-admin -- <email>`). Every admin page checks on the
 * server (requireAdmin in src/lib/session.ts) that the role is there and
 * that this sign-in passed two-factor in the last 12 hours, so this form
 * is only the way in, not the lock. An admin who hasn't set up
 * two-factor yet is sent to /admin/setup-2fa after the password step.
 *
 * The form must never fall back to a native GET submit — that would put
 * the password in the URL (history, server logs, Referer headers). So it
 * prevents the default submit, and declares method="post" for the case
 * where JavaScript hasn't loaded.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  function enter(user: { role?: string | null } | undefined) {
    if (user?.role !== "admin") {
      setNeedsTwoFactor(false);
      setError("This account doesn't have admin access.");
      return;
    }
    router.push("/admin/dashboard");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setIsSubmitting(true);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setIsSubmitting(false);

    if (error?.code === "EMAIL_NOT_VERIFIED") {
      setError("Confirm this account's email first: log in on the main site to get a code.");
      return;
    }
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    if ("twoFactorRedirect" in data && data.twoFactorRedirect) {
      setNeedsTwoFactor(true);
      return;
    }
    enter("user" in data ? (data.user as { role?: string | null }) : undefined);
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
          <TwoFactorForm onVerified={enter} onStartOver={() => setNeedsTwoFactor(false)} />
        ) : (
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
