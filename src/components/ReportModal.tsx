"use client";

import { useEffect, useState } from "react";
import FormError from "@/components/FormError";
import Modal from "@/components/Modal";
import { reportAllowance, submitReport } from "@/lib/report-actions";
import {
  GUEST_REPORT_LIMIT,
  LOGGED_IN_REPORT_LIMIT,
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  type ReportAllowance,
} from "@/lib/reports";
import { useToast } from "@/lib/toast-context";

/**
 * Reports are saved on the server, which also enforces the daily limit
 * (per account, or per IP address for guests). The modal asks how many
 * are left when it opens, so the note below is accurate before the
 * first click.
 */
export default function ReportModal({
  mediaId,
  mediaTitle,
  onClose,
}: {
  mediaId: string;
  mediaTitle: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [allowance, setAllowance] = useState<ReportAllowance | null>(null);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reportAllowance().then(
      (result) => {
        if (!cancelled) setAllowance(result);
      },
      () => {
        if (!cancelled) setError("Couldn't load your report limit. You can still try sending one.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const canReport = allowance ? allowance.remaining > 0 : error !== "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canReport || !reason || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await submitReport({ mediaId, reason, details });
      if (result.ok) {
        showToast("Report submitted — thanks for letting us know");
        onClose();
        return;
      }
      setError(result.error);
      if (result.allowance) setAllowance(result.allowance);
    } catch {
      setError("Couldn't send your report. Please try again.");
    }
    setIsSubmitting(false);
  }

  return (
    <Modal title="Report an Issue" onClose={onClose}>
      <p className="text-sm text-ink-secondary">
        What&apos;s wrong with <span className="font-semibold text-ink-primary">{mediaTitle}</span>?
      </p>

      {/* Rate-limit note — always visible, not just when the limit is
          hit, so the cap isn't a surprise. */}
      <p className="mt-3 rounded-md bg-bg-elevated px-3 py-2 text-xs text-ink-secondary">
        Guests can submit {GUEST_REPORT_LIMIT} report a day. Logged-in users get
        up to {LOGGED_IN_REPORT_LIMIT} a day.{" "}
        {!allowance ? null : allowance.remaining > 0 ? (
          <>
            You have{" "}
            <span className="font-semibold text-ink-primary">
              {allowance.remaining} of {allowance.limit}
            </span>{" "}
            left today{allowance.isLoggedIn ? "" : " — log in for more"}.
          </>
        ) : (
          <span className="font-semibold text-status-error">
            You&apos;ve used today&apos;s limit — try again tomorrow.
          </span>
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="report-reason"
            className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
          >
            What&apos;s the issue?
          </label>
          <select
            id="report-reason"
            required
            disabled={!canReport}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              Select a reason
            </option>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="report-details"
            className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Additional details (optional)
          </label>
          <textarea
            id="report-details"
            rows={3}
            maxLength={MAX_REPORT_DETAILS}
            disabled={!canReport}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Anything else that would help us look into it"
            className="w-full resize-none rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <FormError message={error} />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canReport || !reason || isSubmitting}
            className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Sending…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
