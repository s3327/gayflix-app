"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import { authClient, authErrorMessage } from "@/lib/auth-client";

type Enrollment = { totpURI: string; backupCodes: string[] };

/** The secret from an otpauth:// URI, in groups of 4 for typing by hand. */
function manualKey(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

/**
 * Two steps: confirm the password (Better Auth requires it to turn on
 * two-factor), then scan the QR code and enter the first code. Two-factor
 * only counts as on once that code checks out, so a half-finished setup
 * can simply be started again.
 */
export default function SetupTwoFactor() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  function handleCopyCodes() {
    if (!enrollment?.backupCodes) return;
    navigator.clipboard.writeText(enrollment.backupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  function handleDownloadCodes() {
    if (!enrollment?.backupCodes) return;
    const blob = new Blob([enrollment.backupCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gayflix-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!enrollment) return;
    let cancelled = false;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(enrollment.totpURI, { margin: 1, width: 192 }))
      .then((url) => {
        if (!cancelled) setQrCode(url);
      })
      .catch(() => {
        // The key below can still be typed in by hand.
      });
    return () => {
      cancelled = true;
    };
  }, [enrollment]);

  async function handleEnable(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setIsSubmitting(false);
    if (error || !data || !("totpURI" in data) || !data.totpURI) {
      setError(authErrorMessage(error));
      return;
    }
    setPassword("");
    setEnrollment({ totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
  }

  async function verify(value: string) {
    if (isSubmitting || value.length < 6) return;
    setError("");
    setIsSubmitting(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    if (error) {
      setIsSubmitting(false);
      setError(authErrorMessage(error));
      setCode("");
      setAttempt((n) => n + 1);
      return;
    }
    router.push("/admin/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-border-subtle bg-bg-surface p-8">
        <h1 className="font-display text-2xl font-bold">Set up two-factor sign-in</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Admin accounts sign in with a password and a code from an authenticator app (such as
          1Password, Google Authenticator or Authy).
        </p>

        {!enrollment ? (
          <form method="post" onSubmit={handleEnable} className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
              >
                Confirm your password
              </label>
              <input
                id="password"
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
                {qrCode ? (
                  // A data: URL made in the browser; next/image can't optimize it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrCode}
                    alt="QR code for your authenticator app"
                    width={192}
                    height={192}
                    className="rounded-md bg-white"
                  />
                ) : (
                  <div className="h-48 w-48 rounded-md bg-bg-elevated" aria-hidden />
                )}
              </div>
              <p className="mt-3 text-xs text-ink-secondary">Or enter this key by hand:</p>
              <code className="mt-1 block break-all rounded-md bg-bg-elevated px-3 py-2 font-mono text-sm text-ink-primary">
                {manualKey(enrollment.totpURI)}
              </code>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-ink-primary">2. Save your backup codes</h2>
              <p className="mt-1 text-xs text-ink-secondary">
                If you lose your phone, each of these lets you sign in once. They won&apos;t be
                shown again.
              </p>
              <ul
                aria-label="Backup codes"
                className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-bg-elevated p-3 font-mono text-sm text-ink-primary"
              >
                {enrollment.backupCodes.map((backupCode) => (
                  <li key={backupCode}>{backupCode}</li>
                ))}
              </ul>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyCodes}
                  className="rounded-md border border-border-strong bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink-primary transition-colors hover:bg-bg-elevated"
                >
                  {copiedCodes ? "Copied to clipboard" : "Copy codes"}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodes}
                  className="rounded-md border border-border-strong bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink-primary transition-colors hover:bg-bg-elevated"
                >
                  Download (.txt)
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink-primary">
                3. Enter the 6-digit code the app shows
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
        )}
      </div>
    </main>
  );
}
