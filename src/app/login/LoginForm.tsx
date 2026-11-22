"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import PasswordInput from "@/components/PasswordInput";
import TwoFactorForm from "@/components/TwoFactorForm";
import { signIn } from "@/lib/auth-actions";
import { isActionRedirect, startGoogleSignIn } from "@/lib/auth-redirects";
import { authHref } from "@/lib/safe-redirect";

/**
 * The public log-in form (page.tsx sends members who are already signed
 * in on their way first).
 *
 * Mirrors admin/login's layout/visual language deliberately (same card,
 * same field styling) so the two don't feel like different products,
 * but this is a separate page: admin auth and user auth are different
 * systems.
 *
 * Signs in on the server (signIn in src/lib/auth-actions.ts), which
 * sends the browser on to `next` (the validated ?next= page that sent
 * the visitor here), or /account. An account whose email was never confirmed gets a fresh code
 * and is sent to /verify-email instead. Accounts with two-factor turned
 * on get the code step next (TwoFactorForm); `twoFactor` opens on it
 * (page.tsx checks a sign-in is waiting), and the step puts
 * `twoFactor=1` in the address so a reload comes back to it. Google shows
 * only where Supabase Auth has it turned on (`google`); `googleFailed`
 * is a Google sign-in that came back without a session.
 */
export default function LoginForm({
  next,
  google,
  googleFailed = false,
  twoFactor = false,
}: {
  next: string | null;
  google: boolean;
  googleFailed?: boolean;
  twoFactor?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    googleFailed ? "Google sign-in didn't finish. Please try again." : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(twoFactor);

  const destination = next ?? "/account";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn(email, password, destination);
    } catch (thrown) {
      // Signed in: the server is sending the browser to `destination`.
      if (isActionRedirect(thrown)) return;
      setIsSubmitting(false);
      throw thrown;
    }
    setIsSubmitting(false);

    if ("needsEmailCode" in result) {
      const params = new URLSearchParams({ email: email.trim(), next: destination });
      router.push(`/verify-email?${params}`);
      return;
    }
    if ("needsTwoFactor" in result) {
      setPassword("");
      setNeedsTwoFactor(true);
      // A reload comes back to the code step (page.tsx).
      const codeStep = new URLSearchParams({ twoFactor: "1" });
      if (next) codeStep.set("next", next);
      window.history.replaceState(null, "", `/login?${codeStep}`);
      return;
    }
    setError(result.error);
  }

  async function handleGoogleAuth() {
    // Google verifies the email itself, so this skips /verify-email.
    setError(await startGoogleSignIn(destination));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm rounded-card border border-border-subtle bg-bg-surface p-8">
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
          <h1 className="mt-4 font-display text-2xl font-bold">Welcome Back</h1>
          <p className="mt-1 text-sm text-ink-muted">Log in to Gayflix</p>
        </div>

        {needsTwoFactor ? (
          <TwoFactorForm
            next={destination}
            startOverPath={authHref("/login", next)}
            onStartOver={() => setNeedsTwoFactor(false)}
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
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

        {google && !needsTwoFactor && (
          <>
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
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink-secondary">
          New to Gayflix?{" "}
          <Link
            href={authHref("/signup", next)}
            className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
