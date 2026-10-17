"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, AlertCircle, VideoOff, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { resolveAllForMedia } from "@/lib/admin-report-actions";

export type ReportGroup = {
  mediaId: string;
  mediaTitle: string;
  mediaType: "movie" | "series" | "episode";
  reason: string;
  count: number;
  latestAt: string;
  detailsList: string[];
  reportIds: string[];
  /** The title's or episode's video sources that are still on. */
  sources: { id: string; label: string }[];
};

export default function ReportTriageView({
  groups,
  adminEditHref,
}: {
  groups: ReportGroup[];
  adminEditHref: (mediaId: string) => string;
}) {
  const [isPending, startTransition] = useTransition();
  const [expandedMediaId, setExpandedMediaId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Keyed by group (title and reason), so two groups for one title don't share them.
  const [disableSource, setDisableSource] = useState<Record<string, string>>({});

  const handleResolveGroup = (group: ReportGroup, key: string) => {
    startTransition(async () => {
      await resolveAllForMedia({
        mediaId: group.mediaId,
        reportIds: group.reportIds,
        disableSourceId: disableSource[key] || undefined,
        notes: notes[key] || undefined,
      });
    });
  };

  if (groups.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-border-subtle bg-bg-surface p-12 text-center text-sm text-ink-secondary">
        <Check className="mx-auto h-8 w-8 text-status-success mb-2" />
        No open issues! All player reports have been triaged.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => {
        const isExpanded = expandedMediaId === `${group.mediaId}-${group.reason}`;
        const key = `${group.mediaId}-${group.reason}`;

        return (
          <div
            key={key}
            className="rounded-card border border-border-subtle bg-bg-surface p-5 shadow-2xs space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-status-error/10 px-2 py-0.5 text-2xs font-bold text-status-error border border-status-error/20">
                    {group.count} {group.count === 1 ? "report" : "reports"}
                  </span>
                  <span className="text-xs text-ink-muted">Latest: {group.latestAt}</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-ink-primary">
                  <Link
                    href={adminEditHref(group.mediaId)}
                    className="hover:text-ink-brand hover:underline"
                  >
                    {group.mediaTitle}
                  </Link>
                </h3>
                <p className="mt-0.5 text-sm font-semibold text-ink-secondary flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-status-warning" />
                  {group.reason}
                </p>
              </div>

              {/* Triage action box */}
              <div className="flex flex-col gap-2 min-w-[280px]">
                <input
                  type="text"
                  placeholder="Resolution notes (optional)..."
                  aria-label={`Resolution notes for ${group.mediaTitle}: ${group.reason}`}
                  maxLength={1000}
                  value={notes[key] || ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs text-ink-primary focus:border-brand-pink focus:outline-hidden"
                />

                {group.sources.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-ink-secondary">
                    <VideoOff className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    <span className="sr-only">Video source to turn off for {group.mediaTitle}</span>
                    <select
                      value={disableSource[key] ?? ""}
                      onChange={(e) =>
                        setDisableSource((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-full rounded-md border border-border-subtle bg-bg-elevated px-2 py-1.5 text-xs text-ink-primary focus:border-brand-pink focus:outline-hidden"
                    >
                      <option value="">Leave video sources as they are</option>
                      {group.sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          Turn off {source.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleResolveGroup(group, key)}
                  className="rounded-card bg-brand-pink px-4 py-2 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light flex items-center justify-center gap-1.5 disabled:opacity-60 shadow-2xs"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Resolve these {group.count === 1 ? "report" : `${group.count} reports`}
                </button>
              </div>
            </div>

            {/* Expandable details */}
            {group.detailsList.length > 0 && (
              <div className="border-t border-border-subtle pt-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMediaId(isExpanded ? null : key)
                  }
                  className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink-primary font-medium"
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {isExpanded ? "Hide user details" : `View ${group.detailsList.length} feedback note${group.detailsList.length === 1 ? "" : "s"}`}
                </button>

                {isExpanded && (
                  <ul className="mt-2 space-y-1.5 pl-4 text-xs text-ink-secondary list-disc">
                    {group.detailsList.map((detail, idx) => (
                      <li key={idx} className="break-words">
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

