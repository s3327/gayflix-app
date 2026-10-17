"use client";

import { useMemo } from "react";
import { useHistory } from "@/lib/history-context";
import type { Episode } from "@/lib/media";

/**
 * Where the viewer is in a series, from their History (an episode's
 * entry has the episode's id): the episodes they've pressed Play on,
 * and the one they played last, which "Continue" goes back to.
 */
export function useSeriesProgress(episodes: Episode[]): {
  watched: Set<string>;
  last: Episode | undefined;
} {
  const { history } = useHistory();
  return useMemo(() => {
    const byId = new Map(episodes.map((ep) => [ep.id, ep]));
    const played = history.filter((entry) => byId.has(entry.id));
    // History is newest first.
    return {
      watched: new Set(played.map((entry) => entry.id)),
      last: played[0] && byId.get(played[0].id),
    };
  }, [episodes, history]);
}
