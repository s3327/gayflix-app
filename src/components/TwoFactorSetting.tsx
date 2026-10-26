"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import FormError from "@/components/FormError";
import TwoFactorEnrollment, { BackupCodes } from "@/components/TwoFactorEnrollment";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useToast } from "@/lib/toast-context";

const SECONDARY_BUTTON =
  "rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary";

/** Asks for the password, then runs `action` with it. */
function PasswordStep({
  label,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  onSubmit: (password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);
        const problem = await onSubmit(password);
        setIsSubmitting(false);
        if (problem) setError(problem);
      }}
      className="mt-4 flex max-w-sm flex-col gap-3"
    >
      <label htmlFor="two-factor-confirm" className="text-sm font-semibold text-ink-primary">
        {label}
      </label>
      <input
        id="two-factor-confirm"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
      />
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light disabled:opacity-60"
        >
          {isSubmitting ? "Checking…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type Step = "idle" | "enroll" | "codes" | "disable";

/**
 * Account → Setting: two-factor sign-in, for members who want it (A14).
 * Off by default; turning it on takes the password and a first code
 * (TwoFactorEnrollment), and from then on every sign-in with a password
 * asks for a code (TwoFactorForm). Members can get new backup codes or
 * turn it off, with their password. Staff can't turn it off: the admin
 * panel needs it (and the server refuses). An account with no password
 * (Google sign-in only) can't turn it on.
 */
export default function TwoFactorSetting({
  enabled,
  hasPassword,
  isStaff,
}: {
  enabled: boolean;
  hasPassword: boolean;
  isStaff: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  if (!hasPassword) {
    return (
      <p className="mt-4 text-sm text-ink-secondary">
        Your account signs in with Google, so Google&apos;s own sign-in protects it. Two-factor here
        needs a password; set one with &ldquo;Forgot password&rdquo; on the log-in page first.
      </p>
    );
  }

  if (!enabled) {
    return step === "enroll" ? (
      <div className="max-w-md">
        <TwoFactorEnrollment
          onEnabled={() => {
            setStep("idle");
            showToast("Two-factor sign-in is on");
            router.refresh();
          }}
        />
        <button type="button" onClick={() => setStep("idle")} className={`mt-4 ${SECONDARY_BUTTON}`}>
          Cancel
        </button>
      </div>
    ) : (
      <div className="mt-4">
        <p className="text-sm text-ink-secondary">
          Off. Turn it on to sign in with your password and a code from an authenticator app (such
          as 1Password, Google Authenticator or Authy), so a stolen password isn&apos;t enough.
        </p>
        <button type="button" onClick={() => setStep("enroll")} className={`mt-4 ${SECONDARY_BUTTON}`}>
          Turn On Two-Factor
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-status-success">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        On
      </p>
      <p className="mt-1 text-sm text-ink-secondary">
        Signing in with your password also asks for a code from your authenticator app, or one of
        your backup codes. Lost both? Ask us through Contact and we&apos;ll help you back in.
      </p>

      {newCodes && (
        <div className="mt-4 max-w-md">
          <p className="text-sm font-semibold text-ink-primary">Your new backup codes</p>
          <p className="mt-0.5 text-xs text-ink-secondary">
            The old ones no longer work. These won&apos;t be shown again.
          </p>
          <BackupCodes codes={newCodes} />
        </div>
      )}

      {step === "codes" && (
        <PasswordStep
          label="Confirm your password to get new backup codes"
          submitLabel="Get New Codes"
          onCancel={() => setStep("idle")}
          onSubmit={async (password) => {
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
            if (error || !data) return authErrorMessage(error);
            setNewCodes(data.backupCodes);
            setStep("idle");
            return null;
          }}
        />
      )}

      {step === "disable" && (
        <PasswordStep
          label="Confirm your password to turn off two-factor"
          submitLabel="Turn Off"
          onCancel={() => setStep("idle")}
          onSubmit={async (password) => {
            const { error } = await authClient.twoFactor.disable({ password });
            if (error) return authErrorMessage(error);
            setStep("idle");
            setNewCodes(null);
            showToast("Two-factor sign-in is off");
            router.refresh();
            return null;
          }}
        />
      )}

      {step === "idle" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setStep("codes")} className={SECONDARY_BUTTON}>
            New Backup Codes
          </button>
          {isStaff ? (
            <p className="self-center text-xs text-ink-muted">Staff accounts keep two-factor on.</p>
          ) : (
            <button
              type="button"
              onClick={() => setStep("disable")}
              className={`${SECONDARY_BUTTON} hover:text-status-error`}
            >
              Turn Off
            </button>
          )}
        </div>
      )}
    </div>
  );
}
