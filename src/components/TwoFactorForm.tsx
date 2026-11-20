"use client";

import { useState } from "react";
import Link from "next/link";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import { signOut } from "@/lib/auth-actions";
import { isActionRedirect } from "@/lib/auth-redirects";
import { verifyTwoFactor } from "@/lib/two-factor-actions";

/**
 * The second step of signing in, for accounts with two-factor turned on:
 * the 6-digit code from an authenticator app. Shown by /login and
 * /admin/login once the password is accepted. The password-only session
 * counts as signed out until verifyTwoFactor accepts the code, which
 * sends the browser on to `next`. The device is never remembered, so
 * every sign-in asks for a code. "Start over" ends that waiting session
 * (signOut, which comes back to `startOverPath`).
 */
export default function TwoFactorForm({
  next,
  startOverPath,
  onStartOver,
}: {
  next: string;
  startOverPath: string;
  onStartOver: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Remounts the code boxes to clear them after a wrong code.
  const [attempt, setAttempt] = useState(0);

  async function verify(value: string) {
    if (isSubmitting || value.length < 6) return;
    setError("");
    setIsSubmitting(true);
    let result: { error: string };
    try {
      result = await verifyTwoFactor(value, next);
    } catch (thrown) {
      // Accepted: the server is sending the browser to `next`.
      if (isActionRedirect(thrown)) return;
      setIsSubmitting(false);
      throw thrown;
    }
    setIsSubmitting(false);
    setError(result.error);
    setCode("");
    setAttempt((n) => n + 1);
  }

  async function startOver() {
    onStartOver();
    try {
      await signOut(startOverPath);
    } catch (thrown) {
      if (!isActionRedirect(thrown)) throw thrown;
    }
  }

  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        verify(code);
      }}
      className="mt-8 flex flex-col gap-5"
    >
      <div className="flex flex-col gap-3">
        <p className="text-center text-sm text-ink-secondary">
          Enter the 6-digit code from your authenticator app.
        </p>
        <OtpInput key={attempt} onChange={setCode} onComplete={verify} />
      </div>

      <FormError message={error} />

      <button
        type="submit"
        disabled={isSubmitting || code.length < 6}
        className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Checking…" : "Verify"}
      </button>

      <p className="text-xs text-ink-muted">
        Lost the device with your authenticator app? Ask us through{" "}
        <Link href="/contact" className="font-medium text-ink-brand hover:text-brand-pink-light">
          Contact
        </Link>{" "}
        and we&apos;ll help you back in.
      </p>

      <div className="flex justify-end text-xs">
        <button
          type="button"
          onClick={startOver}
          className="font-medium text-ink-secondary transition-colors hover:text-ink-primary"
        >
          Start over
        </button>
      </div>
    </form>
  );
}
