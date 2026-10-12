"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FormError from "@/components/FormError";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";

/**
 * The Delete Account button on /account/setting and the dialog that
 * confirms it. Accounts with a password must enter it; Google-only
 * accounts confirm with the button, and Better Auth then wants a
 * session from the last day. The auth server checks both again
 * (src/lib/account-deletion.ts). Once the account is gone, the member
 * lands on /home with a note saying so.
 */
export default function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const { deleteAccount } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  function close() {
    setIsOpen(false);
    setPassword("");
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsDeleting(true);
    const message = await deleteAccount(hasPassword ? password : undefined);
    if (message) {
      setIsDeleting(false);
      setError(message);
      return;
    }
    showToast("Your account has been deleted.");
    router.replace("/home");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-card border border-status-error/40 px-5 py-2.5 text-sm font-semibold text-status-error transition-colors hover:bg-status-error/10"
      >
        Delete Account
      </button>

      {isOpen && (
        <Modal title="Delete your account?" onClose={close}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-ink-secondary">
              Your profile, favorites, lists and watch history are deleted for good. You can
              sign up again later, but none of it comes back.
            </p>
            {hasPassword && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="delete-password"
                  className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
                >
                  Your password
                </label>
                <input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                />
              </div>
            )}
            <FormError message={error} />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isDeleting}
                className="rounded-card border border-status-error/40 bg-status-error/10 px-5 py-2 text-sm font-bold text-status-error transition-colors hover:bg-status-error/20 disabled:opacity-60"
              >
                {isDeleting ? "Deleting…" : "Delete Forever"}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
