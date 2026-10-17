"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2, Check, AlertCircle } from "lucide-react";
import { setUserRole } from "@/lib/admin-user-actions";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Site Owner: Full control over all catalog, users, settings, and ownership transfer.",
  admin: "Administrator: Access to catalog, user accounts, system settings, and background jobs.",
  editor: "Editor: Access to catalog media, series, episodes, video sources, and TMDB import.",
  moderator: "Moderator: Access to user account moderation, banning, and report resolution.",
  user: "Member: Standard public site user with no administrative panel access.",
};

export default function UserRoleSection({
  userId,
  currentRole,
  isSelf,
  isViewerOwner,
}: {
  userId: string;
  currentRole: string;
  isSelf: boolean;
  isViewerOwner: boolean;
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(currentRole);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const handleRoleChange = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      try {
        const res = await setUserRole(userId, selectedRole);
        if (res.ok) {
          setFeedback({ ok: true, message: `Role updated to ${selectedRole}.` });
          router.refresh();
        } else {
          setFeedback({ ok: false, message: res.message || "Failed to update role." });
        }
      } catch (err) {
        setFeedback({
          ok: false,
          message: err instanceof Error ? err.message : "Failed to change role",
        });
      }
    });
  };

  const isOwnerAccount = currentRole === "owner";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-ink-brand" />
        <p className="text-xs text-ink-secondary">
          Assign specific administrative roles to control back-office permissions.
        </p>
      </div>

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

      {isSelf ? (
        <p className="text-xs text-ink-muted">You cannot change your own role.</p>
      ) : isOwnerAccount && !isViewerOwner ? (
        <p className="text-xs text-ink-muted">Only the current Owner can modify the Owner account.</p>
      ) : (
        <form onSubmit={handleRoleChange} className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <select
              aria-label="User role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-xs font-medium text-ink focus:border-brand-pink focus:outline-none"
            >
              <option value="user">Member (user)</option>
              <option value="moderator">Moderator</option>
              <option value="editor">Editor</option>
              <option value="admin">Administrator</option>
              {isViewerOwner && <option value="owner">Owner (Transfer Ownership)</option>}
            </select>

            <button
              type="submit"
              disabled={isPending || selectedRole === currentRole}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-brand-pink/50 hover:bg-bg-surface hover:text-ink-brand disabled:opacity-50 transition-colors"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-brand" />}
              <span>Update Role</span>
            </button>
          </div>

          <p className="text-2xs text-ink-secondary">
            {ROLE_DESCRIPTIONS[selectedRole] ?? ROLE_DESCRIPTIONS.user}
          </p>
        </form>
      )}
    </div>
  );
}
