"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import LoginPrompt from "@/components/LoginPrompt";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth-context";
import { reportContent } from "@/lib/community-actions";
import { REPORT_REASONS, type ReportReason } from "@/lib/community-rules";
import { useToast } from "@/lib/toast-context";

/**
 * Report, on someone else's review or Community list: asks why, and
 * sends it to the moderators (/admin/community). Guests are asked to log
 * in first. `what` names the thing in the dialog: "review by Sam".
 */
export default function ReportContentButton({
  target,
  what,
  className = "",
}: {
  target: { reviewId: string } | { listId: string };
  what: string;
  className?: string;
}) {
  const { isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [isPending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      try {
        await reportContent(target, reason);
        setIsOpen(false);
        showToast("Thanks. Our moderators will take a look.");
      } catch {
        showToast("Couldn't send the report. Try again later.", { type: "error" });
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink-primary ${className}`}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        Report<span className="sr-only"> {what}</span>
      </button>

      {isOpen && !isLoggedIn && (
        <LoginPrompt
          title="Log in to report"
          description="Reports come from members, so moderators can follow up. Log in or sign up, and you'll come right back here."
          onClose={() => setIsOpen(false)}
        />
      )}

      {isOpen && isLoggedIn && (
        <Modal title={`Report ${what}`} onClose={() => setIsOpen(false)}>
          <fieldset>
            <legend className="text-sm text-ink-secondary">What&apos;s wrong with it?</legend>
            <div className="mt-3 space-y-2">
              {(Object.keys(REPORT_REASONS) as ReportReason[]).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-ink-primary">
                  <input
                    type="radio"
                    name="reason"
                    value={key}
                    checked={reason === key}
                    onChange={() => setReason(key)}
                    className="accent-brand-pink"
                  />
                  {REPORT_REASONS[key]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!reason || isPending}
              onClick={send}
              className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light disabled:opacity-50"
            >
              Send Report
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
