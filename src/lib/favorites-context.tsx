"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import * as library from "@/lib/library-actions";
import type { FavoriteEntry } from "@/lib/library-types";
import { useToast } from "@/lib/toast-context";

export type { FavoriteEntry } from "@/lib/library-types";

type FavoritesContextValue = {
  favorites: FavoriteEntry[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (entry: FavoriteEntry) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export const SAVE_FAILED = "Couldn't save that. Please try again.";

/**
 * The signed-in user's favorites, stored in their account (see
 * src/lib/library-actions.ts). `initial` comes from the server render of
 * the (main) layout, so there's no loading flash. Changes show
 * immediately and are undone, with a toast, if the server rejects them.
 * Removing one offers Undo.
 * Guests have no favorites; FavoriteButton asks them to log in.
 */
export function FavoritesProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial?: Record<string, FavoriteEntry>;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [favorites, setFavorites] = useState<Record<string, FavoriteEntry>>(initial ?? {});

  const isFavorite = useCallback((id: string) => Boolean(favorites[id]), [favorites]);

  // Shows the change at once and saves it; puts it back if the save fails.
  const save = useCallback(
    (entry: FavoriteEntry, on: boolean) => {
      const apply = (value: boolean) =>
        setFavorites((prev) => {
          const next = { ...prev };
          if (value) next[entry.id] = entry;
          else delete next[entry.id];
          return next;
        });
      apply(on);
      library.setFavorite(entry, on).catch(() => {
        apply(!on);
        showToast(SAVE_FAILED, { type: "error" });
      });
    },
    [showToast]
  );

  const toggleFavorite = useCallback(
    (entry: FavoriteEntry) => {
      if (!userId) {
        showToast("Log in to save favorites", { type: "info" });
        return;
      }
      // Decide add vs. remove once, up front, so the stored result and
      // the toast can never disagree (and the updaters stay pure).
      const wasFavorite = Boolean(favorites[entry.id]);
      save(entry, !wasFavorite);
      if (wasFavorite) {
        // Undo adds it straight back (not a toggle, which would read the
        // favorites as they were when this toast went up).
        showToast("Removed from Favorites", {
          action: { label: "Undo", onClick: () => save(entry, true) },
        });
      } else {
        showToast("Added to Favorites");
      }
    },
    [favorites, save, showToast, userId]
  );

  const value = useMemo<FavoritesContextValue>(
    // Newest first: the server sends them oldest first, and new ones are
    // added at the end.
    () => ({ favorites: Object.values(favorites).reverse(), isFavorite, toggleFavorite }),
    [favorites, isFavorite, toggleFavorite]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}
