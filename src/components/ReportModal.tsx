"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useReportLimit, GUEST_REPORT_LIMIT, LOGGED_IN_REPORT_LIMIT } from "@/lib/use-report-limit";
import { useToast } from "@/lib/toast-context";

const REASONS = [
  "Video won't play",
  "Wrong video for this title",
  "Poor video/audio quality",
  "Audio out of sync",
  "Subtitles missing or wrong",
  "Other",
];

/**
 * No backend — submitting just records the click against this browser's
 * daily count (see use-report-limit.ts) and shows a toast. There's
 * nowhere yet for the actual report content (reason/details) to go;
 * that's wiring for whenever a real reports pipeline/admin queue exists.
 */
export default function ReportModal({
  mediaTitle,
  onClose,
}: {
  mediaTitle: string;
  onClose: () => void;
}) {
  const { limit, remaining, canReport, recordReport, isLoggedIn } = useReportLimit();
  const { showToast } = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canReport || !reason) return;
    recordReport();
    showToast("Report submitted — thanks for letting us know");
    onClose();
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
        {canReport ? (
          <>
            You have{" "}
            <span className="font-semibold text-ink-primary">
              {remaining} of {limit}
            </span>{" "}
            left today{isLoggedIn ? "" : " — log in for more"}.
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
            {REASONS.map((r) => (
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
            disabled={!canReport}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Anything else that would help us look into it"
            className="w-full resize-none rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canReport || !reason}
            className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit
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
