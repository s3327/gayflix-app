"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
 * Guests' history stays in this browser's localStorage, and moves into
 * the account the next time they sign in here. Re-watching a title
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

  // Signed in with history left over from browsing as a guest: move it
  // into the account once, then clear it from this browser.
  const guestEntries = useMemo(() => Object.values(guestHistory), [guestHistory]);
  useEffect(() => {
    if (!userId || guestEntries.length === 0) return;
    library
      .importHistory(guestEntries)
      .then(() => {
        setAccountHistory((prev) => {
          const next = { ...prev };
          for (const entry of guestEntries) {
            const existing = next[entry.id];
            if (!existing || existing.watchedAt < entry.watchedAt) next[entry.id] = entry;
          }
          return next;
        });
        setGuestHistory({});
      })
      .catch(() => {
        // Left in this browser; the next page load tries again.
      });
  }, [userId, guestEntries, setGuestHistory]);

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
          showToast(SAVE_FAILED);
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
        showToast(SAVE_FAILED);
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

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return context;
}
