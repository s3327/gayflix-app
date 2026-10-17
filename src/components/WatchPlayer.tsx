"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Flag, Play, RotateCcw } from "lucide-react";
import { useHistory } from "@/lib/history-context";
import type { FavoriteEntry } from "@/lib/favorites-context";
import type { VideoSourceEntry } from "@/lib/video-source";
import { recordView } from "@/lib/view-actions";
import ReportModal from "@/components/ReportModal";
import ServerTabs from "@/components/ServerTabs";
import SourcePlayer from "@/components/SourcePlayer";

/**
 * The player on /watch/[id] and /episode/[id]. `sources` are the movie's
 * or the episode's video sources (getVideoSources in src/lib/catalog.ts),
 * one server tab each. With none, it says the title is coming soon and
 * offers nothing to play or report.
 *
 * Watching records a History entry and counts a view for Trending
 * (src/lib/view-actions.ts), once per visit to the page. A file or a
 * stream counts once it's actually playing, so a server that fails
 * counts nothing. An embed counts when Play is pressed: it's a
 * provider's player in a frame, which this app can't see inside.
 *
 * The Report button lives here, so every page with a player gets it.
 */
export default function WatchPlayer({
  media,
  sources,
  backdropUrl,
}: {
  media: FavoriteEntry;
  sources: VideoSourceEntry[];
  backdropUrl?: string;
}) {
  const { recordWatch } = useHistory();
  const [active, setActive] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // The server that couldn't play, while it's still the chosen one.
  const [failedId, setFailedId] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  // Bumped when focus should move to the video: Play and Try again
  // replace their own buttons, so focus follows rather than dropping to
  // the top of the page.
  const [focusRequest, setFocusRequest] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const countedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const source = sources[active];
  const failed = source !== undefined && failedId === source.id;

  useEffect(() => {
    if (focusRequest > 0) frameRef.current?.querySelector<HTMLElement>("iframe, video")?.focus();
  }, [focusRequest]);

  // The video had focus until it was replaced by the error.
  useEffect(() => {
    if (failed && document.activeElement === document.body) errorRef.current?.focus();
  }, [failed]);

  function handleStart() {
    if (countedRef.current) return;
    countedRef.current = true;
    recordWatch(media);
    // A view that fails to count isn't worth bothering anyone about.
    recordView(media.id).catch(() => {});
  }

  function handlePlay() {
    setIsPlaying(true);
    setFocusRequest((n) => n + 1);
  }

  function handleSelect(index: number) {
    // Choosing the server that failed tries it again.
    setActive(index);
    setFailedId(null);
  }

  function handleRetry() {
    setFailedId(null);
    setFocusRequest((n) => n + 1);
  }

  const noun = media.kind === "episode" ? "episode" : "movie";

  return (
    <div>
      {/* The frame clips anything outside it, so what's inside draws its
          focus ring inside its edges. */}
      <div
        ref={frameRef}
        className="relative aspect-video w-full overflow-hidden rounded-card border-2 border-border-strong bg-bg-surface"
      >
        {source && isPlaying && !failed ? (
          <SourcePlayer
            key={source.id}
            source={source}
            title={media.title}
            onStart={handleStart}
            onFail={() => setFailedId(source.id)}
          />
        ) : (
          <>
            {backdropUrl && (
              <Image
                src={backdropUrl}
                alt=""
                fill
                priority
                sizes="(min-width: 1100px) 1036px, 100vw"
                className="object-cover"
              />
            )}
            <div
              className={`absolute inset-0 ${source && !isPlaying ? "bg-bg-base/50" : "bg-bg-base/85"}`}
            />

            {!source ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center sm:gap-2 sm:p-6">
                <Image
                  src="/brand/gayflix-logo-full.png"
                  alt="Gayflix"
                  width={1000}
                  height={667}
                  sizes="(min-width: 1024px) 264px, (min-width: 640px) 168px, 96px"
                  className="h-16 w-auto sm:h-28 lg:h-44"
                />
                <p className="font-display text-xl font-bold text-ink-primary">Coming soon</p>
                <p className="max-w-sm text-sm text-ink-secondary">
                  This {noun} isn&apos;t ready to watch yet. Check back soon.
                </p>
              </div>
            ) : failed ? (
              <div
                ref={errorRef}
                tabIndex={-1}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center focus-visible:-outline-offset-4"
              >
                <div role="alert">
                  <p className="font-semibold text-ink-primary">
                    {source.label} isn&apos;t working right now.
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {sources.length > 1
                      ? "Try again, or choose another server below."
                      : "Try again, or report it below so we can fix it."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex items-center gap-2 rounded-md border border-border-strong bg-bg-elevated px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:border-brand-pink"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Try again
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePlay}
                aria-label={`Play ${media.title}`}
                className="group absolute inset-0 flex items-center justify-center focus-visible:-outline-offset-4"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-pink text-ink-onBrand shadow-lg transition-transform group-hover:scale-110">
                  <Play className="ml-1 h-7 w-7 fill-current" aria-hidden />
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <ServerTabs sources={sources} active={active} onSelect={handleSelect} />
          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="flex items-center gap-1.5 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:text-status-error"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden />
            Report an issue
          </button>
        </div>
      )}

      {isReportOpen && (
        <ReportModal
          mediaId={media.id}
          mediaTitle={media.title}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>
  );
}
