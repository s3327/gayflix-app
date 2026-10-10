"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { authClient, authErrorMessage, signInWithGoogle } from "@/lib/auth-client";

/**
 * Public sign-up — start of the sign-up → verify-email flow. This is
 * the one place email verification actually happens in this scaffold;
 * /login (an existing account) skips straight to /account.
 *
 * Creates the account with Better Auth, which emails a 6-digit code;
 * /verify-email takes it from there and signs the user in. No session
 * exists until the email is confirmed.
 *
 * If the email already has an account, Better Auth answers the same way
 * (so sign-up can't be used to find out who has an account) and no new
 * account is created.
 */
export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!agreedToTerms) return; // guarded by disabled button too; belt-and-suspenders
    setError("");
    setIsSubmitting(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setIsSubmitting(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  async function handleGoogleAuth() {
    if (!agreedToTerms) return;
    // Google verifies the email itself, so this skips /verify-email.
    setError(await signInWithGoogle("/account"));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
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
            Create Your Account
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Join Gayflix</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="name"
              className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jamie Rivera"
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
            />
          </div>

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
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
            />
          </div>

          <FormError message={error} />

          <button
            type="submit"
            disabled={!agreedToTerms || isSubmitting}
            className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating Account…" : "Sign Up"}
          </button>
        </form>

        {/* Required for both the form above and the Google button below —
            legal acceptance shouldn't depend on which sign-up path is used. */}
        <label className="mt-5 flex items-start gap-2.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(event) => setAgreedToTerms(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-border-strong bg-bg-elevated text-ink-brand accent-brand-pink focus-visible:outline-hidden"
          />
          <span>
            I agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            or
          </span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <div className="mt-6">
          <GoogleAuthButton
            label="Continue with Google"
            onClick={handleGoogleAuth}
            disabled={!agreedToTerms}
          />
        </div>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
