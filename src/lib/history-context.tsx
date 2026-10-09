"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { FavoriteEntry } from "@/lib/favorites-context";
import { usePersistedRecord } from "@/lib/use-persisted-record";

const STORAGE_KEY = "gayflix:history";

export type HistoryEntry = FavoriteEntry & {
  /** When Play was last pressed for this title — see history-context.tsx
   *  header comment for why this is the granularity, not watch progress. */
  watchedAt: string;
};

type HistoryContextValue = {
  history: HistoryEntry[]; // sorted newest-watched-first
  recordWatch: (entry: FavoriteEntry) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

/**
 * Records "Play was pressed," not real watch progress — see the Play
 * button's own comment (WatchPlayer.tsx) for why: the video itself may
 * be a third-party embed this app can't see inside of, but the Play
 * button lives in this app's own DOM, so that click is always
 * observable regardless of what the embed can report back.
 *
 * Same status as Favorites/Lists: localStorage (via usePersistedRecord),
 * no backend yet. Re-watching a title updates its watchedAt and moves
 * it back to the top rather than creating a duplicate entry.
 */
export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = usePersistedRecord<HistoryEntry>(STORAGE_KEY);

  const recordWatch = useCallback(
    (entry: FavoriteEntry) => {
      setHistory((prev) => ({
        ...prev,
        [entry.id]: { ...entry, watchedAt: new Date().toISOString() },
      }));
    },
    [setHistory]
  );

  const removeFromHistory = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [setHistory]
  );

  const clearHistory = useCallback(() => {
    setHistory({});
  }, [setHistory]);

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

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return context;
}
