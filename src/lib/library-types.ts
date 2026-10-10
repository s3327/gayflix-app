import type { MediaType } from "@/lib/media";

/**
 * Enough to render a title card (favorites, history, list items) without
 * looking the title up again: snapshotted when the user acts on it.
 * Deliberately NOT the full Media type: the rich movie-detail pages
 * (mock-movie-details.ts) don't have a posterUrl at all (they're
 * gradient-block only), so posterUrl and gradient are both optional and
 * MediaCoverThumb falls back between them.
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

export type HistoryEntry = FavoriteEntry & {
  /** When Play was last pressed for this title (ISO string). */
  watchedAt: string;
};

export type MediaList = {
  id: string;
  name: string;
  createdAt: string;
  /** Snapshot copies, deduped by id, in the order they were added. */
  items: FavoriteEntry[];
};

/** A signed-in user's saved titles, as the (main) layout hands them to the client. */
export type Library = {
  favorites: Record<string, FavoriteEntry>;
  history: Record<string, HistoryEntry>;
  lists: Record<string, MediaList>;
};

export const MAX_LIST_NAME_LENGTH = 80;

/** Generous caps, so one account can't fill the database. */
export const MAX_FAVORITES = 1000;
export const MAX_LISTS = 100;
export const MAX_LIST_ITEMS = 500;

/** Title and episode ids are slugs; they end up in links like /movie/[id]. */
export function isMediaId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

const SHORT = 200;
const isString = (value: unknown, max = SHORT): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const isOptionalString = (value: unknown, max = 2000) =>
  value === undefined || (typeof value === "string" && value.length <= max);

// Shared lists show one user's snapshots to everyone, so a poster must be
// an https URL or a path on this site, and a gradient only Tailwind
// gradient stops (it ends up in a className).
const isPosterUrl = (value: unknown) =>
  value === undefined ||
  (isOptionalString(value) && (/^\/(?![/\\])/.test(value as string) || isHttpsUrl(value as string)));

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const isGradient = (value: unknown) =>
  value === undefined ||
  (isOptionalString(value, SHORT) &&
    /^(?:(?:from|via|to)-[a-z]+(?:-[a-z]+)*)(?: (?:from|via|to)-[a-z]+(?:-[a-z]+)*){0,2}$/.test(
      value as string
    ));

/**
 * Checks a title snapshot sent from the browser and keeps only the known
 * fields, so server functions never store arbitrary JSON. Returns null
 * when it isn't a valid entry.
 */
export function parseEntry(value: unknown): FavoriteEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (
    !isMediaId(entry.id) ||
    !isString(entry.title) ||
    typeof entry.year !== "number" ||
    !Number.isInteger(entry.year) ||
    typeof entry.duration !== "string" ||
    entry.duration.length > SHORT ||
    (entry.type !== "movie" && entry.type !== "series") ||
    typeof entry.genre !== "string" ||
    entry.genre.length > SHORT ||
    !isPosterUrl(entry.posterUrl) ||
    !isGradient(entry.gradient) ||
    (entry.kind !== undefined && entry.kind !== "episode")
  ) {
    return null;
  }
  return {
    id: entry.id,
    title: entry.title,
    year: entry.year,
    duration: entry.duration,
    type: entry.type,
    genre: entry.genre,
    ...(entry.posterUrl ? { posterUrl: entry.posterUrl as string } : {}),
    ...(entry.gradient ? { gradient: entry.gradient as string } : {}),
    ...(entry.kind ? { kind: "episode" as const } : {}),
  };
}

/** A list name as it will be stored: trimmed, capped, never empty. */
export function cleanListName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_LIST_NAME_LENGTH) : "";
  return trimmed || "Untitled List";
}
