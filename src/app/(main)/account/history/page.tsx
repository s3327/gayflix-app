"use client";

import { History as HistoryIcon, Trash2 } from "lucide-react";
import { useHistory } from "@/lib/history-context";
import HistoryCard from "@/components/HistoryCard";

/**
 * Reads from HistoryProvider (see (main)/layout.tsx), populated by
 * WatchPlayer's Play button — one entry per title, most-recently-played
 * first (re-watching bumps it back to the top rather than duplicating).
 *
 * Currently the only page that can add to History is /watch/[id], which
 * only exists for the 4 rich mock-movie-details.ts titles (no watch
 * page/video entry point exists yet for series or the rest of the
 * catalog) — so this list will only ever show up to 4 titles until that
 * gap is closed separately.
 */
export default function AccountHistoryPage() {
  const { history, clearHistory } = useHistory();

  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">History</h1>
          <p className="mt-1 text-sm text-ink-muted">What you&apos;ve watched</p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-2 rounded-card border border-border-strong px-4 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-status-error"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
          {history.map((entry) => (
            <HistoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
          <HistoryIcon className="h-8 w-8 text-ink-muted" strokeWidth={1.5} />
          <p className="text-sm text-ink-secondary">
            No watch history yet — press Play on a title to see it here.
          </p>
        </div>
      )}
    </div>
  );
}
