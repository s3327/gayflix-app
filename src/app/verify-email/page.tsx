"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import OtpInput from "@/components/OtpInput";
import { useAuth } from "@/lib/auth-context";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Second step of the sign-up flow only — /signup routes here after
 * submitting. /login does not go through this; an existing account
 * skips straight to /account. Reads the email from the ?email= query
 * param that /signup sets.
 */
function VerifyEmailForm() {
  const router = useRouter();
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "your email";

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const isComplete = code.length === CODE_LENGTH;

  // Countdown for the "Resend code" link — doesn't actually resend
  // anything (no backend), just gates re-clicking the way a real one
  // would.
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isComplete) return;
    // No real verification yet — any complete 6-digit code "succeeds"
    // and hands off to the signed-in app. Swap for a real API call once
    // auth exists. This is the actual completion point of sign-up, so
    // login() happens here, not back on /signup.
    login();
    router.push("/account");
  }

  function handleResend() {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_SECONDS);
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
            Verify Your Email
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Enter the 6-digit code we sent to{" "}
            <span className="font-semibold text-ink-secondary">{email}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <OtpInput onChange={setCode} />

          <button
            type="submit"
            disabled={!isComplete}
            className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Verify
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
              className="font-medium text-brand-pink transition-colors hover:text-brand-pink-light"
            >
              Resend code
            </button>
          )}
        </p>

        <p className="mt-2 text-center text-sm text-ink-secondary">
          <Link
            href="/login"
            className="font-medium text-brand-pink transition-colors hover:text-brand-pink-light"
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
