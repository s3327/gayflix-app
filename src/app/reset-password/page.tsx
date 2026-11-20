"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import PasswordInput from "@/components/PasswordInput";
import { resetPassword } from "@/lib/auth-actions";

const CODE_LENGTH = 6;

/**
 * The second step of a password reset: /forgot-password sends the
 * visitor here with ?email=, and Supabase Auth has emailed a 6-digit
 * code if the account exists. The code and a new password go to
 * resetPassword (src/lib/auth-actions.ts), which signs out every
 * session of the account; the user then logs in with the new password.
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || code.length !== CODE_LENGTH) return;
    setError("");
    setIsSubmitting(true);
    const result = await resetPassword(email, code, password);
    setIsSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDone(true);
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
          <h1 className="mt-4 font-display text-2xl font-bold">Reset Password</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {done ? "Your password has been changed" : "Enter the code and a new password"}
          </p>
        </div>

        {done || !email ? (
          <div className="mt-8 flex flex-col gap-6 text-center">
            {!done && (
              <p className="text-sm text-ink-secondary">
                This link is missing the email address. Request a new code.
              </p>
            )}
            <Link
              href={done ? "/login" : "/forgot-password"}
              className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              {done ? "Log In" : "Request a New Code"}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <p className="text-center text-sm text-ink-secondary">
              If an account exists for{" "}
              <span className="font-semibold text-ink-primary">{email}</span>, we&apos;ve
              emailed it a 6-digit code.
            </p>

            <OtpInput autoFocus onChange={setCode} />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
              >
                New Password
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

            <FormError message={error} />

            <button
              type="submit"
              disabled={isSubmitting || code.length !== CODE_LENGTH}
              className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Set New Password"}
            </button>

            <Link
              href="/forgot-password"
              className="text-center text-sm font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
            >
              Send a new code
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
