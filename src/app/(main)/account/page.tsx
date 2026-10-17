"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import FormError from "@/components/FormError";
import OtpInput from "@/components/OtpInput";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth-context";

type EmailStep = "idle" | "new-email" | "verify" | "done";
type PasswordStep = "idle" | "new-password" | "done" | "link-sent";

function memberSince(createdAt: Date | string | undefined) {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Default view under /account. Two modes:
 *  - view: profile summary, "Edit Profile" button top-right
 *  - edit: display name field, plus separate multi-step flows for
 *    changing email and password, each ending in its own inline
 *    "done" confirmation, and an overall Save/Cancel pair at the
 *    bottom.
 *
 * Reads and changes the real account:
 *  - Save updates the display name.
 *  - Change Email asks for the password (unless the account signs in
 *    with Google only) and sends a code to the new address; the email
 *    changes only once that code is entered, and the old address is
 *    told (src/lib/auth.ts checks both).
 *  - Change Password needs the current password, and signs out every
 *    other device. An account that signs in with Google only has no
 *    password to change: it says so, and Set a Password emails a link
 *    (the reset-password one, which adds a password to the account).
 */
export default function AccountPage() {
  const { user, refresh } = useAuth();
  const activeEmail = user?.email ?? "";

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(""); // draft, bound to the input
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [emailStep, setEmailStep] = useState<EmailStep>("idle");
  // Whether the account has a password; until the lookup answers, and
  // if it fails, assume so (the server knows the real answer).
  const [hasPassword, setHasPassword] = useState(true);
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  const [passwordStep, setPasswordStep] = useState<PasswordStep>("idle");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let current = true;
    authClient.listAccounts().then(({ data }) => {
      if (current && data) setHasPassword(data.some((account) => account.providerId === "credential"));
    });
    return () => {
      current = false;
    };
  }, [userId]);

  function resetSubFlows() {
    setEmailStep("idle");
    setEmailPassword("");
    setNewEmail("");
    setEmailError("");
    setPasswordStep("idle");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordMismatch(false);
    setPasswordError("");
    setSaveError("");
  }

  function handleStartEditing() {
    setDisplayName(user?.name ?? "");
    setIsEditing(true);
  }

  function handleCancel() {
    // Discards the display-name draft. Email/password changes are left
    // alone here — each already went through its own explicit
    // verification step, which is its own commit point.
    resetSubFlows();
    setIsEditing(false);
  }

  async function handleSave() {
    // Saves the display name. Any email/password change that already
    // reached "done" was applied at that point, not here.
    const name = displayName.trim();
    if (name && name !== user?.name) {
      setIsSaving(true);
      const { error } = await authClient.updateUser({ name });
      setIsSaving(false);
      if (error) {
        setSaveError(authErrorMessage(error));
        return;
      }
      await refresh();
    }
    resetSubFlows();
    setIsEditing(false);
  }

  function handleStartEmailChange() {
    setEmailStep("new-email");
  }

  async function handleSetPassword() {
    setPasswordError("");
    const { error } = await authClient.requestPasswordReset({
      email: activeEmail,
      redirectTo: "/reset-password",
    });
    if (error) {
      setPasswordError(authErrorMessage(error));
      return;
    }
    setPasswordStep("link-sent");
  }

  async function handleSubmitNewEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!newEmail.trim()) return;
    setEmailError("");
    // Better Auth's own client has no password field here; the server
    // checks it before the endpoint runs (src/lib/auth.ts).
    const { error } = await authClient.$fetch("/email-otp/request-email-change", {
      method: "POST",
      body: { newEmail: newEmail.trim(), ...(hasPassword && { password: emailPassword }) },
    });
    if (error) {
      setEmailError(authErrorMessage(error));
      return;
    }
    setEmailStep("verify");
  }

  async function handleEmailCodeComplete(otp: string) {
    setEmailError("");
    const { error } = await authClient.emailOtp.changeEmail({ newEmail: newEmail.trim(), otp });
    if (error) {
      setEmailError(authErrorMessage(error));
      return;
    }
    await refresh();
    setEmailStep("done");
  }

  async function handleSubmitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!newPassword || newPassword !== confirmNewPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    setPasswordError("");
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      setPasswordError(authErrorMessage(error));
      return;
    }
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
            onClick={handleStartEditing}
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
            <p className="text-sm text-ink-primary">{user?.name}</p>
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
            <p className="text-sm text-ink-primary">
              {hasPassword ? "••••••••" : "None yet: you sign in with Google"}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Member Since
            </span>
            <p className="text-sm text-ink-primary">{memberSince(user?.createdAt)}</p>
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
                  onClick={handleStartEmailChange}
                  className="text-xs font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
                >
                  Change Email
                </button>
              )}
            </div>

            {emailStep === "idle" && (
              <p className="text-sm text-ink-primary">{activeEmail}</p>
            )}

            {emailStep === "new-email" && (
              <form onSubmit={handleSubmitNewEmail} className="flex flex-col gap-3">
                <p className="text-sm text-ink-secondary">
                  {hasPassword
                    ? "Enter your new email address and your password"
                    : "Enter your new email address"}
                </p>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="newEmail" className="text-sm text-ink-secondary">
                    New email
                  </label>
                  <input
                    id="newEmail"
                    type="email"
                    autoComplete="email"
                    required
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    placeholder="new@example.com"
                    className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                  />
                </div>
                {hasPassword && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="emailPassword" className="text-sm text-ink-secondary">
                      Current password
                    </label>
                    <input
                      id="emailPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={emailPassword}
                      onChange={(event) => {
                        setEmailPassword(event.target.value);
                        setEmailError("");
                      }}
                      className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                    />
                  </div>
                )}
                <FormError message={emailError} />
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
                <OtpInput autoFocus onComplete={handleEmailCodeComplete} />
                <FormError message={emailError} />
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
                  onClick={hasPassword ? () => setPasswordStep("new-password") : handleSetPassword}
                  className="text-xs font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
                >
                  {hasPassword ? "Change Password" : "Set a Password"}
                </button>
              )}
            </div>

            {passwordStep === "idle" && (
              <>
                <p className="text-sm text-ink-primary">
                  {hasPassword ? "••••••••" : "None yet: you sign in with Google"}
                </p>
                <FormError message={passwordError} />
              </>
            )}

            {passwordStep === "link-sent" && (
              <div className="flex items-center gap-2 text-sm font-medium text-status-success">
                <Check className="h-4 w-4" />
                We&apos;ve emailed {activeEmail} a link to set one.
              </div>
            )}

            {passwordStep === "new-password" && (
              <form onSubmit={handleSubmitNewPassword} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="currentPassword" className="text-sm text-ink-secondary">
                    Current password
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value);
                      setPasswordError("");
                    }}
                    className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="newPassword" className="text-sm text-ink-secondary">
                    New password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setPasswordMismatch(false);
                    }}
                    className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirmNewPassword" className="text-sm text-ink-secondary">
                    Confirm new password
                  </label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmNewPassword}
                    onChange={(event) => {
                      setConfirmNewPassword(event.target.value);
                      setPasswordMismatch(false);
                    }}
                    className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                  />
                </div>
                {passwordMismatch && (
                  <p className="text-xs text-status-error">
                    Passwords don&apos;t match.
                  </p>
                )}
                <FormError message={passwordError} />
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

            {passwordStep === "done" && (
              <div className="flex items-center gap-2 text-sm font-medium text-status-success">
                <Check className="h-4 w-4" />
                Password changed. Other devices have been signed out.
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <FormError message={saveError} />
          <div className="flex gap-3 border-t border-border-subtle pt-6">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-card bg-brand-pink px-6 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-wait disabled:opacity-70"
            >
              {isSaving ? "Saving…" : "Save"}
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
