"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Public forgot-password — linked from /login. Unlike admin's
 * forgot-password (still a bare "coming soon" placeholder), this one
 * has real UI for both states, since it's the page /login already
 * points real users at. Submitting doesn't actually send anything (no
 * backend/email service yet) — it just flips to the confirmation view,
 * the same "UI only" status as everything else in this scaffold.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: React.FormEvent) {
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
            Forgot Password
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {submitted
              ? "Check your inbox for a reset link"
              : "We'll email you a link to reset it"}
          </p>
        </div>

        {submitted ? (
          <div className="mt-8 flex flex-col gap-6 text-center">
            <p className="text-sm text-ink-secondary">
              If an account exists for{" "}
              <span className="font-semibold text-ink-primary">{email}</span>,
              a password reset link is on its way.
            </p>
            <Link
              href="/login"
              className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
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
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              Send Reset Link
            </button>

            <Link
              href="/login"
              className="text-center text-sm font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
            >
              Back to login
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
