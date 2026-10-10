"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import OtpInput from "@/components/OtpInput";

type EmailStep = "idle" | "confirm-current" | "new-email" | "verify" | "done";
type PasswordStep = "idle" | "new-password" | "verify" | "done";

// Static placeholder profile data — no real session/user record to read
// from yet (see AccountLayout's note on deferred auth).
const INITIAL_NAME = "Jamie Rivera";
const INITIAL_EMAIL = "jamie@example.com";

/**
 * Default view under /account. Two modes:
 *  - view: profile summary, "Edit Profile" button top-right
 *  - edit: display name field, plus separate multi-step flows for
 *    changing email and password, each ending in its own inline
 *    "done" confirmation, and an overall Save/Cancel pair at the
 *    bottom.
 *
 * No backend — every "success" here (email confirmed, code verified,
 * password matches) is a local check against in-memory state, not a
 * real API call. Swap in the real thing once auth/session
 * architecture exists.
 */
export default function AccountPage() {
  const [isEditing, setIsEditing] = useState(false);
  const [savedName, setSavedName] = useState(INITIAL_NAME);
  const [displayName, setDisplayName] = useState(INITIAL_NAME); // draft, bound to the input
  const [activeEmail, setActiveEmail] = useState(INITIAL_EMAIL);

  const [emailStep, setEmailStep] = useState<EmailStep>("idle");
  const [confirmCurrentEmail, setConfirmCurrentEmail] = useState("");
  const [emailConfirmError, setEmailConfirmError] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const [passwordStep, setPasswordStep] = useState<PasswordStep>("idle");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  function resetSubFlows() {
    setEmailStep("idle");
    setConfirmCurrentEmail("");
    setEmailConfirmError(false);
    setNewEmail("");
    setPasswordStep("idle");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordMismatch(false);
  }

  function handleCancel() {
    // Discards the display-name draft, back to the last saved value.
    // Email/password changes are left alone here — each already went
    // through its own explicit verification step, which is treated as
    // its own commit point, not something Cancel should silently undo.
    setDisplayName(savedName);
    resetSubFlows();
    setIsEditing(false);
  }

  function handleSave() {
    // Commits the display-name draft. Any email/password change that
    // already reached "done" was applied at verification time, not
    // here — this just wraps up the edit session.
    setSavedName(displayName);
    resetSubFlows();
    setIsEditing(false);
  }

  function handleConfirmCurrentEmail(event: React.FormEvent) {
    event.preventDefault();
    if (confirmCurrentEmail.trim().toLowerCase() !== activeEmail.toLowerCase()) {
      setEmailConfirmError(true);
      return;
    }
    setEmailConfirmError(false);
    setEmailStep("new-email");
  }

  function handleSubmitNewEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!newEmail.trim()) return;
    setEmailStep("verify");
  }

  function handleEmailCodeComplete() {
    // Any complete 6-digit code "succeeds" — no real verification yet.
    setActiveEmail(newEmail);
    setEmailStep("done");
  }

  function handleSubmitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!newPassword || newPassword !== confirmNewPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    setPasswordStep("verify");
  }

  function handlePasswordCodeComplete() {
    setPasswordStep("done");
  }

  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Account</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isEditing ? "Editing your profile details" : "Manage your profile details"}
          </p>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="shrink-0 rounded-card bg-brand-pink px-5 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            Edit Profile
          </button>
        )}
      </div>

      {!isEditing ? (
        <div className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Name
            </span>
            <p className="text-sm text-ink-primary">{savedName}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Email
            </span>
            <p className="text-sm text-ink-primary">{activeEmail}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Password
            </span>
            <p className="text-sm text-ink-primary">••••••••</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Member Since
            </span>
            <p className="text-sm text-ink-primary">January 2026</p>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {/* Display name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="displayName"
              className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
            >
              Display Name
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
            />
          </div>

          {/* Change email */}
          <div className="flex flex-col gap-3 border-t border-border-subtle pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Email
              </span>
              {emailStep === "idle" && (
                <button
                  type="button"
                  onClick={() => setEmailStep("confirm-current")}
                  className="text-xs font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
                >
                  Change Email
                </button>
              )}
            </div>

            {emailStep === "idle" && (
              <p className="text-sm text-ink-primary">{activeEmail}</p>
            )}

            {emailStep === "confirm-current" && (
              <form onSubmit={handleConfirmCurrentEmail} className="flex flex-col gap-3">
                <p className="text-sm text-ink-secondary">
                  Confirm your current email to continue
                </p>
                <input
                  type="email"
                  required
                  value={confirmCurrentEmail}
                  onChange={(event) => {
                    setConfirmCurrentEmail(event.target.value);
                    setEmailConfirmError(false);
                  }}
                  placeholder={activeEmail}
                  className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                />
                {emailConfirmError && (
                  <p className="text-xs text-status-error">
                    That doesn&apos;t match your current email.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailStep("idle")}
                    className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {emailStep === "new-email" && (
              <form onSubmit={handleSubmitNewEmail} className="flex flex-col gap-3">
                <p className="text-sm text-ink-secondary">
                  Enter your new email address
                </p>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="new@example.com"
                  className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailStep("idle")}
                    className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {emailStep === "verify" && (
              <div className="flex flex-col items-center gap-4 py-2">
                <p className="text-center text-sm text-ink-secondary">
                  Enter the 6-digit code we sent to{" "}
                  <span className="font-semibold text-ink-primary">{newEmail}</span>
                </p>
                <OtpInput onComplete={handleEmailCodeComplete} />
              </div>
            )}

            {emailStep === "done" && (
              <div className="flex items-center gap-2 text-sm font-medium text-status-success">
                <Check className="h-4 w-4" />
                Email changed to {activeEmail}
              </div>
            )}
          </div>

          {/* Change password */}
          <div className="flex flex-col gap-3 border-t border-border-subtle pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Password
              </span>
              {passwordStep === "idle" && (
                <button
                  type="button"
                  onClick={() => setPasswordStep("new-password")}
                  className="text-xs font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
                >
                  Change Password
                </button>
              )}
            </div>

            {passwordStep === "idle" && (
              <p className="text-sm text-ink-primary">••••••••</p>
            )}

            {passwordStep === "new-password" && (
              <form onSubmit={handleSubmitNewPassword} className="flex flex-col gap-3">
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    setPasswordMismatch(false);
                  }}
                  placeholder="New password"
                  className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                />
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(event) => {
                    setConfirmNewPassword(event.target.value);
                    setPasswordMismatch(false);
                  }}
                  placeholder="Confirm new password"
                  className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                />
                {passwordMismatch && (
                  <p className="text-xs text-status-error">
                    Passwords don&apos;t match.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordStep("idle")}
                    className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {passwordStep === "verify" && (
              <div className="flex flex-col items-center gap-4 py-2">
                <p className="text-center text-sm text-ink-secondary">
                  Enter the 6-digit code we sent to{" "}
                  <span className="font-semibold text-ink-primary">{activeEmail}</span>
                </p>
                <OtpInput onComplete={handlePasswordCodeComplete} />
              </div>
            )}

            {passwordStep === "done" && (
              <div className="flex items-center gap-2 text-sm font-medium text-status-success">
                <Check className="h-4 w-4" />
                Password changed
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-3 border-t border-border-subtle pt-6">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-card bg-brand-pink px-6 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-card border border-border-strong px-6 py-3 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
