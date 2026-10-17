"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import PasswordInput from "@/components/PasswordInput";
import { authClient, authErrorMessage, signInWithGoogle } from "@/lib/auth-client";
import { authHref } from "@/lib/safe-redirect";

/**
 * The public sign-up form — start of the sign-up → verify-email flow
 * (page.tsx sends members who are already signed in on their way first).
 * `next` is the validated ?next= page that sent the visitor here; the
 * email check and Google both come back to it, else to /account.
 *
 * Creates the account with Better Auth, which emails a 6-digit code;
 * /verify-email takes it from there and signs the user in. No session
 * exists until the email is confirmed.
 *
 * If the email already has an account, Better Auth answers the same way
 * (so sign-up can't be used to find out who has an account) and no new
 * account is created.
 *
 * Both ways in need the age and terms box ticked; trying without it says
 * so next to the box rather than greying the buttons out. Google shows
 * only where it's set up (`google`, from src/lib/auth.ts).
 */
export default function SignupForm({ next, google }: { next: string | null; google: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsMissed, setTermsMissed] = useState(false);
  const termsRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** False, and points at the box, when it isn't ticked. */
  function checkTerms() {
    if (agreedToTerms) return true;
    setTermsMissed(true);
    termsRef.current?.focus();
    return false;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!checkTerms()) return;
    setError("");
    setIsSubmitting(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setIsSubmitting(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    const params = new URLSearchParams({ email });
    if (next) params.set("next", next);
    router.push(`/verify-email?${params}`);
  }

  async function handleGoogleAuth() {
    if (!checkTerms()) return;
    // Google verifies the email itself, so this skips /verify-email.
    setError(await signInWithGoogle(next ?? "/account"));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Link href="/" aria-label="Gayflix home" className="rounded-full">
            <Image
              src="/brand/gayflix-icon.png"
              alt=""
              width={500}
              height={500}
              priority
              className="h-10 w-10"
            />
          </Link>
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
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="text-xs text-ink-muted">
              At least 8 characters
            </p>
          </div>

          {/* Required for both the form and the Google button below —
              legal acceptance shouldn't depend on which sign-up path is used. */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2.5 text-sm text-ink-secondary">
              <input
                ref={termsRef}
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => {
                  setAgreedToTerms(event.target.checked);
                  setTermsMissed(false);
                }}
                aria-invalid={termsMissed || undefined}
                aria-describedby={termsMissed ? "terms-error" : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-border-strong bg-bg-elevated text-ink-brand accent-brand-pink"
              />
              <span>
                I&apos;m 18 or older, and I agree to the{" "}
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
            {termsMissed && (
              <p id="terms-error" className="text-xs text-status-error">
                Tick this box to create an account.
              </p>
            )}
          </div>

          <FormError message={error} />

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Creating Account…" : "Sign Up"}
          </button>
        </form>

        {google && (
          <>
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
              />
            </div>
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink-secondary">
          Already have an account?{" "}
          <Link
            href={authHref("/login", next)}
            className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
