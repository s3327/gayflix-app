"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { MediaType } from "@/lib/media";
import { useToast } from "@/lib/toast-context";
import { usePersistedRecord } from "@/lib/use-persisted-record";

const STORAGE_KEY = "gayflix:favorites";

/**
 * Enough to render a favorite on /account/favorite without re-fetching
 * anything — snapshotted at the moment someone hits the heart icon,
 * rather than looked up again later. Deliberately NOT the full Media
 * type: the rich movie-detail pages (mock-movie-details.ts) don't have
 * a posterUrl at all (they're gradient-block only), so posterUrl and
 * gradient are both optional and MediaCoverThumb falls back between them.
 */
export type FavoriteEntry = {
  id: string;
  title: string;
  year: number;
  duration: string;
  type: MediaType;
  genre: string;
  posterUrl?: string;
  gradient?: string;
  /**
   * "episode" when the entry is a single episode (History records these
   * from /episode/[id]) — its id is the episode's, so it links to
   * /episode/[id] rather than /series/[id]. See title-href.ts.
   */
  kind?: "episode";
};

type FavoritesContextValue = {
  favorites: FavoriteEntry[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (entry: FavoriteEntry) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/**
 * No backend yet, so this is localStorage rather than a real API —
 * still real persistence (survives reloads), just client-only and
 * per-browser. Swap usePersistedRecord's underlying storage for real
 * fetch/mutate calls once accounts + a database exist; this Provider's
 * public shape (favorites/isFavorite/toggleFavorite) shouldn't need to
 * change.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [favorites, setFavorites] = usePersistedRecord<FavoriteEntry>(STORAGE_KEY);

  const isFavorite = useCallback(
    (id: string) => Boolean(favorites[id]),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (entry: FavoriteEntry) => {
      // Decide add vs. remove once, up front, so the stored result and
      // the toast can never disagree (and the updater stays pure).
      const wasFavorite = Boolean(favorites[entry.id]);
      setFavorites((prev) => {
        const next = { ...prev };
        if (wasFavorite) {
          delete next[entry.id];
        } else {
          next[entry.id] = entry;
        }
        return next;
      });
      showToast(wasFavorite ? "Removed from Favorites" : "Added to Favorites");
    },
    [favorites, setFavorites, showToast]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites: Object.values(favorites),
      isFavorite,
      toggleFavorite,
    }),
    [favorites, isFavorite, toggleFavorite]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}
