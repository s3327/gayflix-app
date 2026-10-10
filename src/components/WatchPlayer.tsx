"use client";

import { useState } from "react";
import { Flag, Play } from "lucide-react";
import { useHistory } from "@/lib/history-context";
import type { FavoriteEntry } from "@/lib/favorites-context";
import ReportModal from "@/components/ReportModal";

/**
 * Still a placeholder — no real video source or embed exists yet (see
 * ServerTabs). What's real is the Play button and what it does: it
 * records a History entry immediately on click.
 *
 * This is deliberately the observable moment, not deeper playback
 * progress. The Play button lives in this app's own DOM, so its click
 * is always ours to see — but once a real embed is wired in, the video
 * itself may be a third-party iframe this app generally can't see
 * inside of (no access to its play/pause/progress events unless that
 * specific provider exposes a JS API). So "history" here means
 * "Play was pressed for this title," which holds up regardless of what
 * ends up inside the player — not "watched to 42%," which would need a
 * cooperating embed provider to ever be accurate.
 *
 * The Report button lives here too, not on each page individually, so
 * both /watch/[id] and /episode/[id] get it automatically — "wherever
 * a player exists" is exactly this component.
 */
export default function WatchPlayer({ media }: { media: FavoriteEntry }) {
  const { recordWatch } = useHistory();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  function handlePlay() {
    recordWatch(media);
    setIsPlaying(true);
  }

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-card border-2 border-border-strong bg-bg-surface">
        {isPlaying ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
            Now playing — video source not wired up yet
          </div>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={`Play ${media.title}`}
            className="group absolute inset-0 flex items-center justify-center"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-pink text-ink-onBrand transition-transform group-hover:scale-110">
              <Play className="ml-1 h-7 w-7 fill-current" aria-hidden />
            </span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsReportOpen(true)}
        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:text-status-error"
      >
        <Flag className="h-3.5 w-3.5" />
        Report an issue
      </button>

      {isReportOpen && (
        <ReportModal mediaTitle={media.title} onClose={() => setIsReportOpen(false)} />
      )}
    </div>
  );
}
