"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Check, AlertCircle } from "lucide-react";
import { BUTTON_DANGER } from "@/components/admin/FormFields";
import { resetUserTwoFactor } from "@/lib/admin-user-actions";

export default function Reset2FaButton({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const handleReset = () => {
    if (
      !confirm(
        `Are you sure you want to reset Two-Factor Authentication for ${userEmail}? This will remove their authenticator keys and allow them to re-enroll next time they sign in.`
      )
    ) {
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await resetUserTwoFactor(userId);
        if (res.ok) {
          setFeedback({ ok: true, message: res.message || "2FA reset successfully." });
          router.refresh();
        } else {
          setFeedback({ ok: false, message: res.message || "Failed to reset 2FA." });
        }
      } catch (err) {
        setFeedback({
          ok: false,
          message: err instanceof Error ? err.message : "Reset failed",
        });
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleReset}
        disabled={isPending}
        className={BUTTON_DANGER}
        aria-label="Reset two-factor authentication"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <KeyRound className="h-3.5 w-3.5" />
        )}
        <span>Reset Two-Factor Authentication</span>
      </button>

      {feedback && (
        <span
          className={`flex items-center gap-1 text-2xs ${
            feedback.ok ? "text-emerald-400" : "text-status-error"
          }`}
          role="status"
        >
          {feedback.ok ? (
            <Check className="h-3 w-3 shrink-0" />
          ) : (
            <AlertCircle className="h-3 w-3 shrink-0" />
          )}
          {feedback.message}
        </span>
      )}
    </div>
  );
}
