"use client";

import { useState } from "react";
import { History as HistoryIcon, Trash2 } from "lucide-react";
import { useHistory } from "@/lib/history-context";
import ConfirmModal from "@/components/ConfirmModal";
import HistoryCard from "@/components/HistoryCard";

/**
 * Reads from HistoryProvider (see (main)/layout.tsx), populated by
 * WatchPlayer's Play button — one entry per title, most-recently-played
 * first (re-watching bumps it back to the top rather than duplicating).
 *
 * Titles are added from the players: /watch/[id] for a movie and
 * /episode/[id] for an episode. Clear All asks first: it can't be undone.
 */
export default function AccountHistoryPage() {
  const { history, clearHistory } = useHistory();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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
            onClick={() => setIsConfirmOpen(true)}
            className="flex items-center gap-2 rounded-card border border-border-strong px-4 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-status-error"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </button>
        )}
      </div>

      {isConfirmOpen && (
        <ConfirmModal
          title="Clear your history?"
          description={`All ${history.length} ${history.length === 1 ? "title is" : "titles are"} removed from History and Continue Watching. This can't be undone.`}
          confirmLabel="Clear All"
          onConfirm={clearHistory}
          onClose={() => setIsConfirmOpen(false)}
        />
      )}

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
