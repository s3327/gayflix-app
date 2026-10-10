"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import TwoFactorForm from "@/components/TwoFactorForm";
import { authClient, authErrorMessage, signInWithGoogle } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * Public user login.
 *
 * Mirrors admin/login's layout/visual language deliberately (same card,
 * same field styling) so the two don't feel like different products,
 * but this is a separate page: admin auth and user auth are different
 * systems.
 *
 * Signs in with Better Auth and goes to /account (or the validated
 * ?next= page). An account whose email was never confirmed gets a fresh
 * code and is sent to /verify-email instead (Better Auth sends the code
 * on that sign-in attempt). Accounts with two-factor turned on (admins)
 * enter a code from their authenticator app before the session starts.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  // Where to go after logging in: the ?next= page that sent the user
  // here (e.g. RequireLogin on /account/favorite), validated so it can
  // only ever be a path on this site. Read at submit time rather than via
  // useSearchParams, which would force a Suspense boundary on this page.
  function destination() {
    return safeNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const { data, error } = await authClient.signIn.email({ email, password });
    setIsSubmitting(false);

    if (error?.code === "EMAIL_NOT_VERIFIED") {
      const params = new URLSearchParams({ email, next: destination() });
      router.push(`/verify-email?${params}`);
      return;
    }
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setNeedsTwoFactor(true);
      return;
    }
    router.push(destination());
  }

  async function handleGoogleAuth() {
    // Google verifies the email itself, so this skips /verify-email.
    setError(await signInWithGoogle(destination()));
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
          <h1 className="mt-4 font-display text-2xl font-bold">Welcome Back</h1>
          <p className="mt-1 text-sm text-ink-muted">Log in to Gayflix</p>
        </div>

        {needsTwoFactor ? (
          <TwoFactorForm
            onVerified={() => router.push(destination())}
            onStartOver={() => {
              setNeedsTwoFactor(false);
              setPassword("");
            }}
          />
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
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
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
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            or
          </span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <div className="mt-6">
          <GoogleAuthButton label="Continue with Google" onClick={handleGoogleAuth} />
        </div>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          New to Gayflix?{" "}
          <Link
            href="/signup"
            className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
