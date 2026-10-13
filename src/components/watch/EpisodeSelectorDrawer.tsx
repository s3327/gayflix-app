/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListFilter, X } from "lucide-react";

type EpisodeItem = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  duration: string;
  stillUrl?: string | null;
};

export default function EpisodeSelectorDrawer({
  seriesTitle,
  episodes,
  currentEpisodeId,
}: {
  seriesTitle: string;
  episodes: EpisodeItem[];
  currentEpisodeId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Group by season
  const seasonsMap = new Map<number, EpisodeItem[]>();
  for (const ep of episodes) {
    const list = seasonsMap.get(ep.seasonNumber) ?? [];
    list.push(ep);
    seasonsMap.set(ep.seasonNumber, list);
  }
  const seasonNumbers = Array.from(seasonsMap.keys()).sort((a, b) => a - b);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Episode selector"
        className="flex items-center gap-2 rounded-card border border-border-strong px-4 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
      >
        <ListFilter className="h-4 w-4" />
        Episodes
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          {/* Backdrop click to close */}
          <div
            className="absolute inset-0"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Episodes"
            data-drawer="episodes"
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border-subtle bg-bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
              <div className="min-w-0 flex-1 pr-4">
                <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {seriesTitle}
                </span>
                <h2 className="truncate font-display text-lg font-bold text-ink-primary">
                  Episodes
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-bg-elevated hover:text-ink-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Episode List grouped by season */}
            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle p-2">
              {seasonNumbers.map((sNum) => {
                const seasonEps = seasonsMap.get(sNum) ?? [];
                return (
                  <div key={sNum} className="py-2">
                    {seasonNumbers.length > 1 && (
                      <h3 className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
                        Season {sNum}
                      </h3>
                    )}
                    <div className="space-y-1">
                      {seasonEps.map((ep) => {
                        const isCurrent = ep.id === currentEpisodeId;
                        return (
                          <Link
                            key={ep.id}
                            href={`/episode/${ep.id}`}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
                              isCurrent
                                ? "bg-brand-pink/15 text-brand-pink font-semibold border border-brand-pink/30"
                                : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
                            }`}
                          >
                            {ep.stillUrl ? (
                              <img
                                src={ep.stillUrl}
                                alt=""
                                className="h-12 w-20 rounded object-cover shrink-0 bg-bg-surface"
                              />
                            ) : (
                              <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-bg-elevated text-xs text-ink-muted">
                                E{ep.episodeNumber}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-ink-muted">
                                  S{ep.seasonNumber} · E{ep.episodeNumber}
                                </span>
                                <span className="text-xs text-ink-muted">{ep.duration}</span>
                              </div>
                              <p className="truncate text-sm font-medium">{ep.title}</p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
