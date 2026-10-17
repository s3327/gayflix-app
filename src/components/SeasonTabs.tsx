"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Play } from "lucide-react";
import type { Episode } from "@/lib/media";
import { useSeriesProgress } from "@/lib/use-series-progress";

/**
 * Groups a flat episode list by seasonNumber and renders season tabs
 * (Season 1)(Season 2)... with the active season's episodes below.
 * Each row routes to /episode/[id] — there's no inline player here,
 * clicking an episode is a real navigation, same as clicking a poster
 * card routes to a title's own detail page. Episodes the viewer has
 * played are ticked, and the tabs open on the season of the one played
 * last. They're tabs to a screen reader too, and the arrow keys, Home
 * and End move between them.
 */
export default function SeasonTabs({ episodes }: { episodes: Episode[] }) {
  const seasonNumbers = Array.from(
    new Set(episodes.map((ep) => ep.seasonNumber))
  ).sort((a, b) => a - b);

  const { watched, last } = useSeriesProgress(episodes);
  const [activeSeason, setActiveSeason] = useState(last?.seasonNumber ?? seasonNumbers[0] ?? 1);

  const id = useId();
  const tabsRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: React.KeyboardEvent) {
    const index = seasonNumbers.indexOf(activeSeason);
    const lastIndex = seasonNumbers.length - 1;
    const next = {
      ArrowRight: index === lastIndex ? 0 : index + 1,
      ArrowLeft: index === 0 ? lastIndex : index - 1,
      Home: 0,
      End: lastIndex,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActiveSeason(seasonNumbers[next]);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  const activeEpisodes = episodes
    .filter((ep) => ep.seasonNumber === activeSeason)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  return (
    <div>
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Seasons"
        onKeyDown={handleKeyDown}
        className="flex flex-wrap gap-2"
      >
        {seasonNumbers.map((season) => (
          <button
            key={season}
            type="button"
            role="tab"
            id={`${id}-tab-${season}`}
            aria-selected={activeSeason === season}
            aria-controls={`${id}-panel`}
            tabIndex={activeSeason === season ? 0 : -1}
            onClick={() => setActiveSeason(season)}
            className={`rounded-pill px-4 py-1.5 text-xs font-semibold transition-colors ${
              activeSeason === season
                ? "bg-brand-pink text-ink-onBrand"
                : "border border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
            }`}
          >
            Season {season}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${activeSeason}`}
      >
        <ul className="mt-6 flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-bg-surface">
          {activeEpisodes.map((ep) => (
            <li key={ep.id}>
              <Link
                href={`/episode/${ep.id}`}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-bg-elevated sm:px-6"
              >
                {watched.has(ep.id) ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-pink/15 text-ink-brand">
                    <Check className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Watched:</span>
                  </span>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-bold text-ink-secondary">
                    <Play className="h-3.5 w-3.5" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-primary">
                    {ep.episodeNumber}. {ep.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-secondary">
                    {ep.duration}
                    {ep.airDate ? ` · ${ep.airDate}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
