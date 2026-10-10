"use client";

import { useState } from "react";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import { authClient, authErrorMessage } from "@/lib/auth-client";

type VerifiedUser = { role?: string | null };

/**
 * The second step of signing in, for accounts with two-factor turned on:
 * a 6-digit code from an authenticator app, or one of the backup codes.
 * Shown by /login and /admin/login after the password is accepted; the
 * session only starts once this succeeds. The device is never
 * remembered, so every sign-in asks for a code.
 */
export default function TwoFactorForm({
  onVerified,
  onStartOver,
}: {
  onVerified: (user: VerifiedUser) => void;
  onStartOver: () => void;
}) {
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Remounts the code boxes to clear them after a wrong code.
  const [attempt, setAttempt] = useState(0);

  async function verify(value: string) {
    if (isSubmitting || !value) return;
    setError("");
    setIsSubmitting(true);
    const { data, error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice: false })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: false });
    setIsSubmitting(false);
    if (error || !data) {
      setError(authErrorMessage(error));
      setCode("");
      setAttempt((n) => n + 1);
      return;
    }
    onVerified(data.user as VerifiedUser);
  }

  function switchMode() {
    setUseBackupCode((value) => !value);
    setCode("");
    setError("");
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
      {useBackupCode ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="backup-code"
            className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Backup code
          </label>
          <input
            id="backup-code"
            type="text"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="xxxxx-xxxxx"
            className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 font-mono text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
          />
          <p className="text-xs text-ink-muted">Each backup code works once.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-ink-secondary">
            Enter the 6-digit code from your authenticator app.
          </p>
          <OtpInput key={attempt} onChange={setCode} onComplete={verify} />
        </div>
      )}

      <FormError message={error} />

      <button
        type="submit"
        disabled={isSubmitting || (!useBackupCode && code.length < 6)}
        className="w-full rounded-card bg-brand-pink px-6 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Checking…" : "Verify"}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={switchMode}
          className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
        >
          {useBackupCode ? "Use your authenticator app" : "Use a backup code instead"}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="font-medium text-ink-secondary transition-colors hover:text-ink-primary"
        >
          Start over
        </button>
      </div>
    </form>
  );
}
