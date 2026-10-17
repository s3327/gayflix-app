"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { authHref, nextParam, safeNextPath } from "@/lib/safe-redirect";

// Matches OTP_LENGTH in src/lib/auth.ts (not imported: that file is server-only).
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Confirms an email address with the 6-digit code Better Auth emailed.
 * /signup routes here after creating the account, and /login does too
 * when an account's email was never confirmed. Reads ?email= and an
 * optional ?next= (where to go once verified).
 *
 * A correct code confirms the email and signs the user in. The code is
 * sent as soon as all six digits are in (typed, pasted or autofilled);
 * Verify is there for a retry.
 */
function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A code was just sent by /signup or /login, so resending starts on cooldown.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const isComplete = code.length === CODE_LENGTH;

  // Countdown for the "Resend code" link.
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(otp: string) {
    if (otp.length !== CODE_LENGTH || !email || isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    setIsSubmitting(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.push(safeNextPath(searchParams.get("next")));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    verify(code);
  }

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setError("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (error) setError(authErrorMessage(error));
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
          <h1 className="mt-4 font-display text-2xl font-bold">
            Verify Your Email
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Enter the 6-digit code we sent to{" "}
            <span className="font-semibold text-ink-secondary">{email || "your email"}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <OtpInput autoFocus onChange={setCode} onComplete={verify} />

          <FormError
            message={email ? error : "This link is missing the email address. Sign up or log in again."}
          />

          <button
            type="submit"
            disabled={!isComplete || !email || isSubmitting}
            className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Verifying…" : "Verify"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          Didn&apos;t get a code?{" "}
          {cooldown > 0 ? (
            <span className="font-medium text-ink-muted">
              Resend in {cooldown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
            >
              Resend code
            </button>
          )}
        </p>

        <p className="mt-2 text-center text-sm text-ink-secondary">
          Wrong email?{" "}
          <Link
            href={authHref("/signup", nextParam(searchParams.get("next") ?? undefined))}
            className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            Sign up again
          </Link>
        </p>

        <p className="mt-2 text-center text-sm text-ink-secondary">
          <Link
            href={authHref("/login", nextParam(searchParams.get("next") ?? undefined))}
            className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * useSearchParams needs a Suspense boundary around it in the app router
 * (otherwise the whole route bails out of static rendering with a build
 * warning) — the actual form is split into its own component so this
 * page file can wrap it cleanly.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
