"use client";

import { useState } from "react";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import { confirmTwoFactorEnrollment, startTwoFactorEnrollment } from "@/lib/two-factor-actions";

type Enrollment = { factorId: string; qrSvg: string; secret: string };

/** The key in groups of 4, for typing by hand. */
function manualKey(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

/**
 * Turning on two-factor sign-in, for admins (/admin/setup-2fa) and members
 * who choose to (Account → Setting). Confirm the password, and the
 * server makes a new authenticator key (startTwoFactorEnrollment); then
 * scan the QR code and enter the first code. Two-factor only counts as on once that code
 * checks out (confirmTwoFactorEnrollment), so a half-finished setup can
 * simply be started again. There are no backup codes: whoever loses
 * their device asks staff.
 */
export default function TwoFactorEnrollment({ onEnabled }: { onEnabled: () => void }) {
  const [password, setPassword] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleStart(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const result = await startTwoFactorEnrollment(password);
    setIsSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPassword("");
    setEnrollment(result);
  }

  async function verify(value: string) {
    if (!enrollment || isSubmitting || value.length < 6) return;
    setError("");
    setIsSubmitting(true);
    const result = await confirmTwoFactorEnrollment(enrollment.factorId, value);
    if ("error" in result) {
      setIsSubmitting(false);
      setError(result.error);
      setCode("");
      setAttempt((n) => n + 1);
      return;
    }
    onEnabled();
  }

  return !enrollment ? (
    <form method="post" onSubmit={handleStart} className="mt-6 flex flex-col gap-5">
      <p className="text-sm text-ink-secondary">
        You&apos;ll need an authenticator app on your phone. If you ever lose it, ask us through
        Contact to get back in.
      </p>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="two-factor-password"
          className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
        >
          Confirm your password
        </label>
        <input
          id="two-factor-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
        />
      </div>
      <FormError message={error} />
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-card bg-brand-pink px-6 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "Checking…" : "Continue"}
      </button>
    </form>
  ) : (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        verify(code);
      }}
      className="mt-6 flex flex-col gap-6"
    >
      <section>
        <h2 className="text-sm font-semibold text-ink-primary">
          1. Scan this code with your authenticator app
        </h2>
        <div className="mt-3 flex justify-center">
          {/* SVG from the server, shown as an image so none of it runs; next/image can't optimize a data: URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrSvg)}`}
            alt="QR code for your authenticator app"
            width={192}
            height={192}
            className="rounded-md bg-white p-2"
          />
        </div>
        <p className="mt-3 text-xs text-ink-secondary">Or enter this key by hand:</p>
        <code className="mt-1 block break-all rounded-md bg-bg-elevated px-3 py-2 font-mono text-sm text-ink-primary">
          {manualKey(enrollment.secret)}
        </code>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-primary">
          2. Enter the 6-digit code the app shows
        </h2>
        <OtpInput key={attempt} onChange={setCode} onComplete={verify} />
      </section>

      <FormError message={error} />
      <button
        type="submit"
        disabled={isSubmitting || code.length < 6}
        className="w-full rounded-card bg-brand-pink px-6 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Checking…" : "Turn on two-factor"}
      </button>
    </form>
  );
}
