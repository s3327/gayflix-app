"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { triggerJobAction } from "@/lib/admin-job-actions";

export default function JobRunButton({
  jobName,
  jobLabel,
}: {
  jobName: string;
  jobLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  const handleRun = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await triggerJobAction(jobName);
        setFeedback(res);
        router.refresh();
      } catch (err) {
        setFeedback({
          ok: false,
          message: err instanceof Error ? err.message : "Failed to run job",
        });
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleRun}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-pink/50 hover:bg-bg-elevated hover:text-ink-brand disabled:opacity-50"
        aria-label={`Run ${jobLabel}`}
      >
        {isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-brand" />
            <span>Running...</span>
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5 fill-current text-ink-secondary" />
            <span>Run Now</span>
          </>
        )}
      </button>
      {feedback && (
        <span
          className={`flex items-center gap-1 text-2xs ${
            feedback.ok ? "text-emerald-400" : "text-status-error"
          }`}
          role="status"
        >
          {feedback.ok ? (
            <CheckCircle className="h-3 w-3 shrink-0" />
          ) : (
            <AlertCircle className="h-3 w-3 shrink-0" />
          )}
          {feedback.message}
        </span>
      )}
    </div>
  );
}
