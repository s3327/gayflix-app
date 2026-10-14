"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, X, RotateCcw, Loader2, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { BUTTON_SECONDARY } from "@/components/admin/FormFields";
import { rollbackRevisionAction } from "@/lib/admin-revision-actions";
import type { TitleSnapshot } from "@/lib/title-revisions";

export type SerializedRevision = {
  id: string;
  mediaId: string;
  actorEmail: string;
  summary: string | null;
  createdAt: string | Date;
  snapshot: unknown;
};

export default function TitleRevisionsModal({
  initialRevisions,
}: {
  mediaId: string;
  initialRevisions: SerializedRevision[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleRollback = (revisionId: string) => {
    if (!confirm("Are you sure you want to restore this revision? A snapshot of the current version will be saved first.")) {
      return;
    }
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await rollbackRevisionAction(revisionId);
        if (res.ok) {
          setStatusMessage({ ok: true, text: res.message || "Revision restored successfully." });
          router.refresh();
          setTimeout(() => {
            setIsOpen(false);
          }, 1000);
        } else {
          setStatusMessage({ ok: false, text: res.message || "Failed to restore revision." });
        }
      } catch (err) {
        setStatusMessage({
          ok: false,
          text: err instanceof Error ? err.message : "Rollback failed",
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
        aria-label="View revision history"
      >
        <History className="h-4 w-4" />
        Revisions ({initialRevisions.length})
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="revisions-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-border-subtle bg-bg-surface shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div>
                <h2 id="revisions-modal-title" className="font-display text-lg font-bold text-ink">
                  Revision History
                </h2>
                <p className="text-xs text-ink-secondary">
                  Point-in-time snapshots created before metadata edits. Roll back to restore previous versions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-ink-secondary hover:bg-bg-elevated hover:text-ink transition-colors"
                aria-label="Close revisions modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div
                className={`mx-6 mt-4 flex items-center gap-2 rounded-lg p-3 text-xs ${
                  statusMessage.ok
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-status-error/10 border border-status-error/20 text-status-error"
                }`}
                role="status"
              >
                {statusMessage.ok ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Revisions list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {initialRevisions.length === 0 ? (
                <div className="py-12 text-center">
                  <History className="mx-auto h-8 w-8 text-ink-secondary/50" />
                  <p className="mt-2 text-sm font-medium text-ink">No revisions recorded yet</p>
                  <p className="text-xs text-ink-secondary">
                    Snapshots will be saved automatically whenever you save edits to this title.
                  </p>
                </div>
              ) : (
                initialRevisions.map((rev) => {
                  const snap = rev.snapshot as TitleSnapshot | null;
                  const isExpanded = expandedId === rev.id;
                  const dateStr = new Date(rev.createdAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  });

                  return (
                    <div
                      key={rev.id}
                      className="rounded-lg border border-border-subtle bg-bg-elevated/40 p-4 transition-colors hover:border-border-muted"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-ink">{dateStr}</span>
                            <span className="rounded bg-bg-surface px-1.5 py-0.5 text-2xs text-ink-secondary">
                              by {rev.actorEmail}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-ink-secondary">{rev.summary}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : rev.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium text-ink-secondary hover:bg-bg-surface hover:text-ink transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <span>Hide details</span>
                                <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                <span>View snapshot</span>
                                <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRollback(rev.id)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-pink/50 hover:bg-bg-surface hover:text-ink-brand disabled:opacity-50 transition-colors"
                            aria-label={`Restore revision from ${dateStr}`}
                          >
                            {isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin text-ink-brand" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            <span>Restore</span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded snapshot preview */}
                      {isExpanded && snap && (
                        <div className="mt-3 border-t border-border-subtle pt-3 text-2xs space-y-1.5 text-ink-secondary">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>
                              <span className="text-ink-muted">Title: </span>
                              <span className="font-medium text-ink">{snap.title}</span>
                            </div>
                            <div>
                              <span className="text-ink-muted">Year: </span>
                              <span className="font-medium text-ink">{snap.year}</span>
                            </div>
                            <div>
                              <span className="text-ink-muted">Status: </span>
                              <span className="font-medium capitalize text-ink">{snap.status}</span>
                            </div>
                            <div>
                              <span className="text-ink-muted">Duration: </span>
                              <span className="font-medium text-ink">{snap.duration}</span>
                            </div>
                          </div>
                          {snap.genres && snap.genres.length > 0 && (
                            <div>
                              <span className="text-ink-muted">Genres: </span>
                              <span className="text-ink">{snap.genres.join(", ")}</span>
                            </div>
                          )}
                          {snap.synopsis && (
                            <div className="line-clamp-2">
                              <span className="text-ink-muted">Synopsis: </span>
                              <span className="text-ink">{snap.synopsis}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border-subtle px-6 py-3 bg-bg-elevated/20 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-border-subtle bg-bg-surface px-4 py-1.5 text-xs font-medium text-ink hover:bg-bg-elevated transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
