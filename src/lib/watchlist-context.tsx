"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SAVE_FAILED } from "@/lib/favorites-context";
import * as library from "@/lib/library-actions";
import type { FavoriteEntry } from "@/lib/library-types";
import { useToast } from "@/lib/toast-context";

type WatchlistContextValue = {
  /** Newest first. */
  watchlist: FavoriteEntry[];
  isOnWatchlist: (id: string) => boolean;
  toggleWatchlist: (entry: FavoriteEntry) => void;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

/**
 * The signed-in user's Watchlist ("Watch later"): titles they mean to
 * watch, kept apart from Favorites (titles they loved). Works like
 * FavoritesProvider: stored in their account (setWatchlist in
 * src/lib/library-actions.ts), `initial` from the (main) layout's server
 * render, changes shown at once and undone with a toast if the save
 * fails, and removing one offers Undo. Guests have none;
 * WatchlistButton asks them to log in.
 */
export function WatchlistProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial?: Record<string, FavoriteEntry>;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [watchlist, setWatchlistState] = useState<Record<string, FavoriteEntry>>(initial ?? {});

  const isOnWatchlist = useCallback((id: string) => Boolean(watchlist[id]), [watchlist]);

  // Shows the change at once and saves it; puts it back if the save fails.
  const save = useCallback(
    (entry: FavoriteEntry, on: boolean) => {
      const apply = (value: boolean) =>
        setWatchlistState((prev) => {
          const next = { ...prev };
          if (value) next[entry.id] = entry;
          else delete next[entry.id];
          return next;
        });
      apply(on);
      library.setWatchlist(entry, on).catch(() => {
        apply(!on);
        showToast(SAVE_FAILED, { type: "error" });
      });
    },
    [showToast]
  );

  const toggleWatchlist = useCallback(
    (entry: FavoriteEntry) => {
      if (!userId) {
        showToast("Log in to keep a watchlist", { type: "info" });
        return;
      }
      const wasOn = Boolean(watchlist[entry.id]);
      save(entry, !wasOn);
      if (wasOn) {
        showToast("Removed from Watchlist", {
          action: { label: "Undo", onClick: () => save(entry, true) },
        });
      } else {
        showToast("Added to Watchlist");
      }
    },
    [watchlist, save, showToast, userId]
  );

  const value = useMemo<WatchlistContextValue>(
    () => ({ watchlist: Object.values(watchlist).reverse(), isOnWatchlist, toggleWatchlist }),
    [watchlist, isOnWatchlist, toggleWatchlist]
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }
  return context;
}
