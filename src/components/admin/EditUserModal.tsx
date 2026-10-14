"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, X, Loader2, Check, AlertCircle } from "lucide-react";
import { BUTTON_SECONDARY } from "@/components/admin/FormFields";
import { updateUserDetails } from "@/lib/admin-user-actions";

export default function EditUserModal({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  };
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("emailVerified", String(emailVerified));

    startTransition(async () => {
      try {
        const res = await updateUserDetails(user.id, formData);
        if (res.ok) {
          setFeedback({ ok: true, message: res.message || "User details updated successfully." });
          router.refresh();
          setTimeout(() => setIsOpen(false), 900);
        } else {
          setFeedback({ ok: false, message: res.message || "Failed to update user." });
        }
      } catch (err) {
        setFeedback({
          ok: false,
          message: err instanceof Error ? err.message : "Update failed",
        });
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={BUTTON_SECONDARY}
      >
        <Edit2 className="h-3.5 w-3.5" />
        Edit Profile
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <h2 id="edit-user-title" className="font-display text-lg font-bold text-ink">
                Edit User Profile
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-ink-secondary hover:bg-bg-elevated hover:text-ink transition-colors"
                aria-label="Close edit modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {feedback && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
                    feedback.ok
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-status-error/10 border border-status-error/20 text-status-error"
                  }`}
                  role="status"
                >
                  {feedback.ok ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              <div>
                <label htmlFor="user-name" className="block text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Display Name
                </label>
                <input
                  id="user-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink placeholder-ink-muted focus:border-brand-pink focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="user-email" className="block text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Email Address
                </label>
                <input
                  id="user-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink placeholder-ink-muted focus:border-brand-pink focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="email-verified-toggle"
                  type="checkbox"
                  checked={emailVerified}
                  onChange={(e) => setEmailVerified(e.target.checked)}
                  className="h-4 w-4 rounded border-border-subtle bg-bg-elevated text-brand-pink focus:ring-brand-pink"
                />
                <label htmlFor="email-verified-toggle" className="text-xs text-ink">
                  Email address is verified
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-border-subtle bg-bg-surface px-4 py-2 text-xs font-medium text-ink hover:bg-bg-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-pink px-4 py-2 text-xs font-semibold text-ink-onBrand shadow hover:bg-brand-pink/90 disabled:opacity-50 transition-colors"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
