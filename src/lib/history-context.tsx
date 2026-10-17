"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SAVE_FAILED } from "@/lib/favorites-context";
import * as library from "@/lib/library-actions";
import type { FavoriteEntry, HistoryEntry } from "@/lib/library-types";
import { useToast } from "@/lib/toast-context";
import { usePersistedRecord } from "@/lib/use-persisted-record";

export type { HistoryEntry } from "@/lib/library-types";

const GUEST_STORAGE_KEY = "gayflix:history";

type HistoryContextValue = {
  history: HistoryEntry[]; // sorted newest-watched-first
  recordWatch: (entry: FavoriteEntry) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

type HistoryRecord = Record<string, HistoryEntry>;

/**
 * Records "Play was pressed," not real watch progress — see the Play
 * button's own comment (WatchPlayer.tsx) for why: the video itself may
 * be a third-party embed this app can't see inside of, but the Play
 * button lives in this app's own DOM, so that click is always
 * observable regardless of what the embed can report back.
 *
 * Signed in, history lives in the account (src/lib/library-actions.ts).
 * Guests' history stays in this browser's localStorage. When someone
 * signs in here with some left over, they're asked whether it's theirs
 * (a shared computer's guest history may not be): Add moves it into the
 * account, Clear empties it from this browser. Re-watching a title
 * updates its watchedAt and moves it back to the top rather than
 * creating a duplicate entry.
 */
export function HistoryProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial?: HistoryRecord;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [guestHistory, setGuestHistory] = usePersistedRecord<HistoryEntry>(GUEST_STORAGE_KEY);
  const [accountHistory, setAccountHistory] = useState<HistoryRecord>(initial ?? {});
  const history = userId ? accountHistory : guestHistory;
  const setHistory = userId ? setAccountHistory : setGuestHistory;

  // Signed in with history left over from browsing as a guest: ask, then
  // move it into the account or clear it from this browser.
  const guestEntries = useMemo(() => Object.values(guestHistory), [guestHistory]);
  const [isImporting, setIsImporting] = useState(false);
  const offerImport = Boolean(userId) && guestEntries.length > 0;

  async function importGuestHistory() {
    setIsImporting(true);
    try {
      await library.importHistory(guestEntries);
      setAccountHistory((prev) => {
        const next = { ...prev };
        for (const entry of guestEntries) {
          const existing = next[entry.id];
          if (!existing || existing.watchedAt < entry.watchedAt) next[entry.id] = entry;
        }
        return next;
      });
      setGuestHistory({});
      showToast("Added to your history");
    } catch {
      showToast(SAVE_FAILED, { type: "error" });
    } finally {
      setIsImporting(false);
    }
  }

  const recordWatch = useCallback(
    (entry: FavoriteEntry) => {
      setHistory((prev) => ({
        ...prev,
        [entry.id]: { ...entry, watchedAt: new Date().toISOString() },
      }));
      // A missed history write isn't worth interrupting playback for.
      if (userId) library.recordWatch(entry).catch(() => {});
    },
    [setHistory, userId]
  );

  const removeFromHistory = useCallback(
    (id: string) => {
      const removed = history[id];
      setHistory((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (userId && removed) {
        library.removeFromHistory(id).catch(() => {
          setHistory((prev) => ({ ...prev, [id]: removed }));
          showToast(SAVE_FAILED, { type: "error" });
        });
      }
    },
    [history, setHistory, showToast, userId]
  );

  const clearHistory = useCallback(() => {
    const previous = history;
    setHistory({});
    if (userId) {
      library.clearHistory().catch(() => {
        setHistory(previous);
        showToast(SAVE_FAILED, { type: "error" });
      });
    }
  }, [history, setHistory, showToast, userId]);

  const value = useMemo<HistoryContextValue>(
    () => ({
      history: Object.values(history).sort(
        (a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
      ),
      recordWatch,
      removeFromHistory,
      clearHistory,
    }),
    [history, recordWatch, removeFromHistory, clearHistory]
  );

  return (
    <HistoryContext.Provider value={value}>
      {children}
      {offerImport && (
        <section
          aria-labelledby="guest-history-title"
          className="fixed inset-x-4 bottom-20 z-50 rounded-card border border-border-subtle bg-bg-surface p-4 shadow-xl sm:left-auto sm:right-6 sm:w-80"
        >
          <h2 id="guest-history-title" className="text-sm font-semibold text-ink-primary">
            Watched on this browser
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {guestEntries.length === 1
              ? "1 title was watched here before you logged in."
              : `${guestEntries.length} titles were watched here before you logged in.`}{" "}
            Add {guestEntries.length === 1 ? "it" : "them"} to your history, or clear{" "}
            {guestEntries.length === 1 ? "it" : "them"} from this browser?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={importGuestHistory}
              disabled={isImporting}
              className="rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:cursor-wait disabled:opacity-70"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setGuestHistory({})}
              disabled={isImporting}
              className="rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
            >
              Clear
            </button>
          </div>
        </section>
      )}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return context;
}
