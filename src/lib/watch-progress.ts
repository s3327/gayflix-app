/*
 * How far into a movie or an episode someone got, for Continue Watching
 * and for picking up where they stopped. Only Gayflix's own player (a
 * file or a stream) can tell; an embed is a provider's player in a
 * frame, so its titles have no progress.
 */

/** Longer than anything in the catalog; anything past it is bad input. */
const MAX_DURATION_SECONDS = 24 * 60 * 60;

/** Less than this in, playing again starts from the beginning. */
const MIN_RESUME_SECONDS = 10;

/**
 * The end credits: this close to the end (5% of it, at least 30
 * seconds) counts as watched to the end.
 */
function creditsSeconds(duration: number) {
  return Math.max(30, duration * 0.05);
}

export type WatchProgress = { position: number; duration: number };

/**
 * Whole seconds from what the player reports, or null for anything that
 * isn't a position in a video of known length (a live stream's duration
 * is Infinity).
 */
export function parseProgress(position: unknown, duration: unknown): WatchProgress | null {
  if (typeof position !== "number" || typeof duration !== "number") return null;
  if (!Number.isFinite(position) || !Number.isFinite(duration)) return null;
  if (position < 0 || duration < 1 || duration > MAX_DURATION_SECONDS) return null;
  const whole = Math.floor(duration);
  return { position: Math.min(Math.floor(position), whole), duration: whole };
}

/** Watched to the end, or into the credits. */
export function isFinished({ position, duration }: WatchProgress): boolean {
  return duration > 0 && duration - position <= creditsSeconds(duration);
}

/** Where playing again starts: where it stopped, or 0 to start over. */
export function resumePosition(progress: WatchProgress): number {
  if (progress.duration === 0 || isFinished(progress)) return 0;
  return progress.position >= MIN_RESUME_SECONDS ? progress.position : 0;
}

/** How much has been watched, from 0 to 1, for a progress bar. */
export function progressFraction({ position, duration }: WatchProgress): number {
  return duration > 0 ? Math.min(position / duration, 1) : 0;
}

/** "12 min left", rounded up so a few seconds left isn't "0 min". */
export function timeLeft({ position, duration }: WatchProgress): string {
  const minutes = Math.max(1, Math.ceil((duration - position) / 60));
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h left` : `${hours}h ${rest}m left`;
}

/** A position as a player shows it: "4:05", or "1:02:09" from an hour. */
export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
