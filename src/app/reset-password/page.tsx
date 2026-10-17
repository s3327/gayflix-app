"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import PasswordInput from "@/components/PasswordInput";
import { authClient, authErrorMessage } from "@/lib/auth-client";

/**
 * Where the emailed reset link lands. Better Auth checks the link first,
 * then sends the browser here with ?token= (or ?error= when the link is
 * invalid or expired). Setting a new password signs out every existing
 * session for the account.
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error") || !token;

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError("");
    setIsSubmitting(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setIsSubmitting(false);
    if (error) {
      setError(authErrorMessage(error));
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
            {done ? "Your password has been changed" : "Choose a new password"}
          </p>
        </div>

        {done || linkError ? (
          <div className="mt-8 flex flex-col gap-6 text-center">
            {!done && (
              <p className="text-sm text-ink-secondary">
                This reset link is invalid or has expired. Request a new one.
              </p>
            )}
            <Link
              href={done ? "/login" : "/forgot-password"}
              className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              {done ? "Log In" : "Request a New Link"}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
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
              disabled={isSubmitting}
              className="mt-2 w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-wait disabled:opacity-70"
            >
              {isSubmitting ? "Saving…" : "Set New Password"}
            </button>
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
