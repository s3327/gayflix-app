"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SAVE_FAILED } from "@/lib/favorites-context";
import { setRating as saveRating } from "@/lib/rating-actions";
import type { Rating } from "@/lib/ratings";
import { useToast } from "@/lib/toast-context";

type RatingsContextValue = {
  ratingOf: (id: string) => Rating | null;
  /** Rates a movie or series, or (null) takes the rating back. */
  rate: (id: string, value: Rating | null) => void;
};

const RatingsContext = createContext<RatingsContextValue | null>(null);

/**
 * The signed-in user's ratings (Not for me, Like, Love it), by movie or
 * series id. Stored in their account (setRating in
 * src/lib/rating-actions.ts), `initial` from the (main) layout's server
 * render, changes shown at once and undone with a toast if the save
 * fails. Guests have none; RatingButtons asks them to log in.
 */
export function RatingsProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial?: Record<string, Rating>;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [ratings, setRatings] = useState<Record<string, Rating>>(initial ?? {});

  const ratingOf = useCallback((id: string) => ratings[id] ?? null, [ratings]);

  const rate = useCallback(
    (id: string, value: Rating | null) => {
      if (!userId) {
        showToast("Log in to rate titles", { type: "info" });
        return;
      }
      const apply = (next: Rating | null) =>
        setRatings((prev) => {
          const copy = { ...prev };
          if (next) copy[id] = next;
          else delete copy[id];
          return copy;
        });
      const previous = ratings[id] ?? null;
      apply(value);
      saveRating(id, value).catch(() => {
        apply(previous);
        showToast(SAVE_FAILED, { type: "error" });
      });
    },
    [ratings, showToast, userId]
  );

  const value = useMemo<RatingsContextValue>(() => ({ ratingOf, rate }), [ratingOf, rate]);

  return <RatingsContext.Provider value={value}>{children}</RatingsContext.Provider>;
}

export function useRatings() {
  const context = useContext(RatingsContext);
  if (!context) {
    throw new Error("useRatings must be used within a RatingsProvider");
  }
  return context;
}
