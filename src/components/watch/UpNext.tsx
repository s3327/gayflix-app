"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Play } from "lucide-react";

/** Seconds before the next episode starts by itself. */
export const UP_NEXT_SECONDS = 10;

export type NextEpisode = {
  id: string;
  /** "S1 · E4 — Title" */
  label: string;
  /** The episode's still, or else the series' poster. */
  imageUrl: string;
};

/**
 * Over the player once an episode has played to the end: the next
 * episode, counting down to it. Play next episode (or the countdown
 * reaching 0) calls `onPlay`; Cancel calls `onCancel` and leaves the
 * finished video as it is.
 *
 * Focus moves to Play next episode, so Enter goes on and Tab reaches
 * Cancel. Screen readers hear the group's name, Up next, and the button
 * with the episode as its description, but not every second of the
 * countdown.
 */
export default function UpNext({
  next,
  onPlay,
  onCancel,
}: {
  next: NextEpisode;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(UP_NEXT_SECONDS);
  const playRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const play = useEffectEvent(onPlay);

  useEffect(() => {
    playRef.current?.focus();
    const timer = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) play();
  }, [secondsLeft]);

  return (
    <div
      role="group"
      aria-label="Up next"
      className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base/85 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md items-center gap-4">
        {/* A plain <img>, as for the episode page's Previous and Next. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={next.imageUrl}
          alt=""
          className="hidden aspect-video w-40 shrink-0 rounded-md bg-bg-surface object-cover sm:block"
        />
        <div className="min-w-0 flex-1">
          <p aria-hidden className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Up next
          </p>
          <p id={labelId} className="mt-1 truncate font-display text-base font-bold text-ink-primary sm:text-lg">
            {next.label}
          </p>
          <p aria-hidden className="mt-0.5 text-sm text-ink-secondary">
            Starts in {secondsLeft}s
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              ref={playRef}
              type="button"
              aria-describedby={labelId}
              onClick={onPlay}
              className="flex items-center gap-2 rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden />
              Play next episode
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
