import { imageHosts } from "@/lib/image-hosts.mjs";
import { isMediaId } from "@/lib/library-types";
import type { MediaStatus, MediaType } from "@/lib/media";

/*
 * The admin title editor's forms: what each field accepts, and what's
 * worked out from the fields (a card's duration, a new title's address,
 * an episode's id). Pure functions, shared by the server functions in
 * src/lib/admin-catalog-actions.ts and their tests.
 */

/** What a server function sends back to the form that called it. */
export type FormState = {
  /** Field name → what's wrong with it. */
  errors?: Record<string, string>;
  /** True when the save went through. */
  ok?: boolean;
  /** Shown above the form: "Saved.", or a problem that isn't one field's. */
  message?: string;
  /** The values to show: React empties a form after it's submitted. */
  values?: Record<string, string>;
  /** Changes with every reply, so the form starts over from `values`. */
  version?: number;
};

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/** A form's fields as trimmed strings, "" for any that weren't sent. */
export function formValues<F extends string>(form: FormData, fields: readonly F[]) {
  const values = {} as Record<F, string>;
  for (const field of fields) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? value.trim() : "";
  }
  return values;
}

// --- Titles -------------------------------------------------------------------

export const TITLE_FIELDS = [
  "title",
  "year",
  "releaseDate",
  "runtime",
  "genres",
  "country",
  "language",
  "credit",
  "cast",
  "tags",
  "rating",
  "tagline",
  "synopsis",
  "posterUrl",
  "backdropUrl",
  "status",
  "featured",
] as const;

export type TitleField = (typeof TITLE_FIELDS)[number];
export type TitleValues = Record<TitleField, string>;

export type TitleInput = {
  title: string;
  year: number;
  releaseDate: Date | null;
  /** Movies only. */
  runtimeMinutes: number | null;
  genres: string[];
  country: string;
  language: string;
  /** The director of a movie, or the creator of a series. */
  credit: string | null;
  cast: string[];
  tags: string[];
  rating: number | null;
  tagline: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  status: MediaStatus;
  featured: boolean;
};

export const FIRST_YEAR = 1888;

/**
 * The poster of a title that has none: the logo and "No poster yet"
 * (public/brand/no-poster.jpg). A title saved with the poster link left
 * empty gets this, and its form shows the link empty again.
 */
export const NO_POSTER = "/brand/no-poster.jpg";

/**
 * Checks a title form. `hosts` are the image hosts posters may use
 * (imageHosts() unless a test passes its own).
 */
export function parseTitle(
  type: MediaType,
  values: TitleValues,
  { now = new Date(), hosts = imageHosts() }: { now?: Date; hosts?: string[] } = {}
): Parsed<TitleInput> {
  const errors: Record<string, string> = {};
  const check = (field: TitleField, problem: string | null) => {
    if (problem) errors[field] = problem;
  };

  check("title", requiredText(values.title, 200, "Enter the title."));

  const lastYear = now.getUTCFullYear() + 5;
  const year = wholeNumber(values.year);
  if (year === null || year < FIRST_YEAR || year > lastYear) {
    errors.year = `Enter a year from ${FIRST_YEAR} to ${lastYear}.`;
  }

  const releaseDate = values.releaseDate ? calendarDate(values.releaseDate) : null;
  if (values.releaseDate && !releaseDate) errors.releaseDate = "Enter a date, or leave it empty.";

  let runtimeMinutes: number | null = null;
  if (type === "movie") {
    runtimeMinutes = wholeNumber(values.runtime);
    if (runtimeMinutes === null || runtimeMinutes < 1 || runtimeMinutes > 999) {
      errors.runtime = "Enter the runtime in minutes.";
    }
  }

  const genres = splitList(values.genres);
  if (genres.length === 0) errors.genres = "Enter at least one genre.";
  else check("genres", listProblem(genres, 10, 40, "genres"));

  check("country", requiredText(values.country, 60, "Enter the country."));
  check("language", requiredText(values.language, 60, "Enter the language."));
  check("credit", optionalText(values.credit, 120));

  const cast = splitList(values.cast);
  check("cast", listProblem(cast, 50, 80, "names"));
  const tags = splitList(values.tags);
  check("tags", listProblem(tags, 20, 40, "tags"));

  let rating: number | null = null;
  if (values.rating) {
    rating = Number(values.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      errors.rating = "Enter a rating from 0 to 5, or leave it empty.";
    } else {
      rating = Math.round(rating * 10) / 10;
    }
  }

  check("tagline", optionalText(values.tagline, 200));
  check("synopsis", optionalText(values.synopsis, 5000));

  const posterUrl = values.posterUrl || NO_POSTER;
  if (posterUrl !== NO_POSTER) check("posterUrl", imageUrlProblem(posterUrl, hosts));
  if (values.backdropUrl) check("backdropUrl", imageUrlProblem(values.backdropUrl, hosts));

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      title: values.title,
      year: year!,
      releaseDate,
      runtimeMinutes,
      genres,
      country: values.country,
      language: values.language,
      credit: values.credit || null,
      cast,
      tags,
      rating,
      tagline: values.tagline || null,
      synopsis: values.synopsis,
      posterUrl,
      backdropUrl: values.backdropUrl || null,
      status: values.status === "published" ? "published" : "draft",
      featured: values.featured === "on",
    },
  };
}

/** What the library's quick edit drawer may change. */
export type QuickEditInput = {
  id: string;
  title: string;
  year: number;
  status: MediaStatus;
  /** Movies only: the runtime as a card shows it ("1h 52m"). */
  duration?: string;
  genres?: string[];
  tagline?: string | null;
  rating?: number | null;
};

/**
 * Checks the quick edit drawer's fields with the title form's rules.
 * Returns the cleaned fields, or the first problem as a sentence.
 */
export function parseQuickEdit(
  input: unknown,
  type: MediaType,
  { now = new Date() }: { now?: Date } = {}
): { ok: true; data: QuickEditInput } | { ok: false; message: string } {
  if (typeof input !== "object" || input === null) return { ok: false, message: "Nothing to save." };
  const raw = input as Record<string, unknown>;
  if (!isMediaId(raw.id)) return { ok: false, message: "Invalid title ID" };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const titleProblem = requiredText(title, 200, "Enter the title.");
  if (titleProblem) return { ok: false, message: titleProblem };
  const lastYear = now.getUTCFullYear() + 5;
  if (typeof raw.year !== "number" || !Number.isInteger(raw.year) || raw.year < FIRST_YEAR || raw.year > lastYear) {
    return { ok: false, message: `Enter a year from ${FIRST_YEAR} to ${lastYear}.` };
  }
  if (raw.status !== "draft" && raw.status !== "published") return { ok: false, message: "Invalid status" };
  const data: QuickEditInput = { id: raw.id, title, year: raw.year, status: raw.status };

  // A series' duration is its season count, worked out from its episodes.
  if (raw.duration !== undefined && type === "movie") {
    const minutes = typeof raw.duration === "string" ? movieDurationMinutes(raw.duration) : null;
    if (minutes === null || minutes < 1 || minutes > 999) {
      return { ok: false, message: "Enter the runtime like 1h 52m or 112." };
    }
    data.duration = movieDuration(minutes);
  }
  if (raw.genres !== undefined) {
    if (!Array.isArray(raw.genres) || !raw.genres.every((genre) => typeof genre === "string")) {
      return { ok: false, message: "Invalid genres" };
    }
    const genres = splitList(raw.genres.join(","));
    const problem = genres.length === 0 ? "Enter at least one genre." : listProblem(genres, 10, 40, "genres");
    if (problem) return { ok: false, message: problem };
    data.genres = genres;
  }
  if (raw.tagline !== undefined) {
    if (raw.tagline !== null && typeof raw.tagline !== "string") return { ok: false, message: "Invalid tagline" };
    const tagline = raw.tagline?.trim() || null;
    const problem = tagline && optionalText(tagline, 200);
    if (problem) return { ok: false, message: problem };
    data.tagline = tagline;
  }
  if (raw.rating !== undefined) {
    if (raw.rating !== null && (typeof raw.rating !== "number" || !Number.isFinite(raw.rating) || raw.rating < 0 || raw.rating > 5)) {
      return { ok: false, message: "Enter a rating from 0 to 5, or leave it empty." };
    }
    data.rating = raw.rating === null ? null : Math.round(raw.rating * 10) / 10;
  }
  return { ok: true, data };
}

/** The bulk tag modal's changes. */
export type BulkTagInput = {
  addTags: string[];
  removeTags: string[];
  addGenres: string[];
  removeGenres: string[];
};

/** Checks the bulk tag modal's lists, or says what's wrong with them. */
export function parseBulkTags(input: unknown): { ok: true; data: BulkTagInput } | { ok: false; message: string } {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const data: BulkTagInput = { addTags: [], removeTags: [], addGenres: [], removeGenres: [] };
  for (const key of Object.keys(data) as (keyof BulkTagInput)[]) {
    const value = raw[key] ?? [];
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      return { ok: false, message: "Invalid tags or genres" };
    }
    const items = splitList(value.join(","));
    const problem = key.endsWith("Genres") ? listProblem(items, 10, 40, "genres") : listProblem(items, 20, 40, "tags");
    if (problem) return { ok: false, message: problem };
    data[key] = items;
  }
  return { ok: true, data };
}

/** Whether a title's tags and genres fit the title form's limits after a bulk change. */
export function bulkTagsProblem(tags: string[], genres: string[]): string | null {
  if (genres.length === 0) return "Every title needs at least one genre.";
  return listProblem(genres, 10, 40, "genres") ?? listProblem(tags, 20, 40, "tags");
}

/** The form for a new title. */
export function emptyTitleValues(): TitleValues {
  const values = Object.fromEntries(TITLE_FIELDS.map((field) => [field, ""])) as TitleValues;
  values.status = "draft";
  return values;
}

/** The form for an existing title. */
export function titleValues(row: {
  type: MediaType;
  status: MediaStatus;
  title: string;
  year: number;
  releaseDate: Date | null;
  runtimeMinutes: number | null;
  duration: string;
  genres: string[];
  country: string;
  language: string;
  director: string | null;
  creator: string | null;
  cast: string[];
  tags: string[];
  rating: number | null;
  tagline: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  featured: boolean;
}): TitleValues {
  const runtime =
    row.type === "movie" ? (row.runtimeMinutes ?? movieDurationMinutes(row.duration)) : null;
  return {
    title: row.title,
    year: String(row.year),
    releaseDate: row.releaseDate ? row.releaseDate.toISOString().slice(0, 10) : "",
    runtime: runtime === null ? "" : String(runtime),
    genres: row.genres.join(", "),
    country: row.country,
    language: row.language,
    credit: (row.type === "movie" ? row.director : row.creator) ?? "",
    cast: row.cast.join(", "),
    tags: row.tags.join(", "),
    rating: row.rating === null ? "" : String(row.rating),
    tagline: row.tagline ?? "",
    synopsis: row.synopsis,
    posterUrl: row.posterUrl === NO_POSTER ? "" : row.posterUrl,
    backdropUrl: row.backdropUrl ?? "",
    status: row.status,
    featured: row.featured ? "on" : "",
  };
}

// --- Episodes -----------------------------------------------------------------

export const EPISODE_FIELDS = ["series", "season", "episode", "title", "minutes", "airDate"] as const;

export type EpisodeField = (typeof EPISODE_FIELDS)[number];
export type EpisodeValues = Record<EpisodeField, string>;

export type EpisodeInput = {
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  minutes: number;
  airDate: Date | null;
};

export function parseEpisode(values: EpisodeValues): Parsed<EpisodeInput> {
  const errors: Record<string, string> = {};
  if (!isMediaId(values.series)) errors.series = "Choose the series.";

  const seasonNumber = wholeNumber(values.season);
  if (seasonNumber === null || seasonNumber < 1 || seasonNumber > 100) {
    errors.season = "Enter a season from 1 to 100.";
  }
  const episodeNumber = wholeNumber(values.episode);
  if (episodeNumber === null || episodeNumber < 1 || episodeNumber > 1000) {
    errors.episode = "Enter an episode number from 1 to 1000.";
  }

  const titleProblem = requiredText(values.title, 200, "Enter the episode's title.");
  if (titleProblem) errors.title = titleProblem;

  const minutes = wholeNumber(values.minutes);
  if (minutes === null || minutes < 1 || minutes > 999) errors.minutes = "Enter the length in minutes.";

  const airDate = values.airDate ? calendarDate(values.airDate) : null;
  if (values.airDate && !airDate) errors.airDate = "Enter a date, or leave it empty.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      seriesId: values.series,
      seasonNumber: seasonNumber!,
      episodeNumber: episodeNumber!,
      title: values.title,
      minutes: minutes!,
      airDate,
    },
  };
}

export function episodeValues(row: {
  mediaId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  duration: string;
  airDate: Date | null;
}): EpisodeValues {
  const minutes = episodeDurationMinutes(row.duration);
  return {
    series: row.mediaId,
    season: String(row.seasonNumber),
    episode: String(row.episodeNumber),
    title: row.title,
    minutes: minutes === null ? "" : String(minutes),
    airDate: row.airDate ? row.airDate.toISOString().slice(0, 10) : "",
  };
}

/** The admin list of movies or series; their edit pages live under it. */
export function libraryPath(type: MediaType) {
  return `/admin/library/${type === "movie" ? "movies" : "series"}`;
}

/** The form that adds a movie or a series. */
export function uploadPath(type: MediaType) {
  return `/admin/upload/${type === "movie" ? "movies" : "series"}`;
}

/** /episode/[id]: "the-brownstone-season-1-episode-2". */
export function episodeId(seriesId: string, season: number, episode: number) {
  return `${seriesId}-season-${season}-episode-${episode}`;
}

/** One row of a season's table editor, as checked. */
export type SeasonRowInput = {
  id: string;
  episodeNumber: number;
  title: string;
  minutes: number;
  airDate: Date | null;
  stillUrl: string | null;
};

/** A season holds at most this many episodes in the table editor. */
export const SEASON_ROWS_MAX = 1000;

/**
 * Checks a season's table editor. Errors are keyed "<episode id>-<field>",
 * as the table shows them.
 */
export function parseSeasonRows(
  seasonArg: unknown,
  rowsArg: unknown,
  hosts: string[]
): { ok: true; seasonNumber: number; rows: SeasonRowInput[] } | { ok: false; message: string; errors?: Record<string, string> } {
  if (typeof seasonArg !== "number" || !Number.isInteger(seasonArg) || seasonArg < 1 || seasonArg > 100) {
    return { ok: false, message: "Enter a season from 1 to 100." };
  }
  if (!Array.isArray(rowsArg) || rowsArg.length === 0 || rowsArg.length > SEASON_ROWS_MAX) {
    return { ok: false, message: "Nothing to save." };
  }
  const errors: Record<string, string> = {};
  const rows: SeasonRowInput[] = [];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const raw of rowsArg as unknown[]) {
    const row = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    if (!isMediaId(row.id) || ids.has(row.id)) {
      return { ok: false, message: "This table is out of date. Reload the page." };
    }
    const id = row.id;
    ids.add(id);
    const fail = (field: string, problem: string) => {
      errors[`${id}-${field}`] ??= problem;
    };

    const episodeNumber = row.episodeNumber;
    if (typeof episodeNumber !== "number" || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 1000) {
      fail("episodeNumber", "Enter an episode number from 1 to 1000.");
    } else if (numbers.has(episodeNumber)) {
      fail("episodeNumber", `Season ${seasonArg} already has an episode ${episodeNumber}.`);
    } else {
      numbers.add(episodeNumber);
    }

    const title = typeof row.title === "string" ? row.title.trim() : "";
    const titleProblem = requiredText(title, 200, "Enter the title.");
    if (titleProblem) fail("title", titleProblem);

    const minutesMatch = typeof row.duration === "string" ? /^(\d{1,3})\s*(?:min|m)?$/i.exec(row.duration.trim()) : null;
    const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
    if (minutes < 1) fail("duration", "Enter the length in minutes, like 42 min.");

    // A date input's "2026-10-10", or the same day as a full ISO time.
    const airDateText = typeof row.airDate === "string" ? row.airDate.slice(0, 10) : "";
    const airDate = airDateText ? calendarDate(airDateText) : null;
    if (row.airDate != null && row.airDate !== "" && !airDate) fail("airDate", "Enter a date, or leave it empty.");

    const stillUrl = typeof row.stillUrl === "string" && row.stillUrl.trim() ? row.stillUrl.trim() : null;
    if (row.stillUrl != null && typeof row.stillUrl !== "string") fail("stillUrl", "That isn't a link.");
    const stillProblem = stillUrl && imageUrlProblem(stillUrl, hosts);
    if (stillProblem) fail("stillUrl", stillProblem);

    rows.push({ id, episodeNumber: episodeNumber as number, title, minutes, airDate, stillUrl });
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, message: Object.values(errors)[0], errors };
  }
  return { ok: true, seasonNumber: seasonArg, rows };
}

// --- Durations, addresses and gradients ---------------------------------------

/** A movie card's duration: "1h 52m", "2h 05m", "48m". */
export function movieDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

/** Back from "1h 52m" (or "48m", "2h", "90 min") to minutes, or null. */
export function movieDurationMinutes(duration: string): number | null {
  const trimmed = duration.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const minMatch = /^(\d+)\s*min$/i.exec(trimmed);
  if (minMatch) return Number(minMatch[1]);
  const match = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(trimmed);
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

/** A series card's duration: "1 Season", "3 Seasons", or "" with no episodes. */
export function seriesDuration(seasons: number) {
  if (seasons === 0) return "";
  return seasons === 1 ? "1 Season" : `${seasons} Seasons`;
}

/** An episode's length: "42 min". */
export function episodeDuration(minutes: number) {
  return `${minutes} min`;
}

export function episodeDurationMinutes(duration: string): number | null {
  const match = /^(\d+) min$/.exec(duration.trim());
  return match ? Number(match[1]) : null;
}

/**
 * A title's address from its name: "Café & Chill!" → "cafe-and-chill".
 * "" when nothing usable is left (a title in another script, say).
 */
export function slugify(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/**
 * The gradient behind a new title's poster while it loads, picked from
 * the address so it stays the same. The colors are the ones globals.css
 * generates for gradients that come from the database.
 */
const GRADIENTS = [
  "from-brand-pink to-pride-purple",
  "from-pride-blue to-pride-green",
  "from-pride-purple to-brand-pink",
  "from-brand-orange to-pride-yellow",
  "from-pride-green to-pride-blue",
  "from-pride-red to-brand-orange",
  "from-brand-pink to-pride-blue",
  "from-pride-yellow to-pride-purple",
];

export function gradientFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

// --- Field checks -------------------------------------------------------------

function wholeNumber(value: string): number | null {
  return /^\d{1,6}$/.test(value) ? Number(value) : null;
}

/** "2026-10-10" (what a date input sends) as UTC midnight, or null. */
function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

/** "Drama, Romance , drama" → ["Drama", "Romance"]. */
export function splitList(value: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of value.split(",")) {
    const item = part.trim().replace(/\s+/g, " ");
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      items.push(item);
    }
  }
  return items;
}

function requiredText(value: string, max: number, missing: string) {
  if (!value) return missing;
  return optionalText(value, max);
}

function optionalText(value: string, max: number) {
  return value.length > max ? `Keep it under ${max} characters.` : null;
}

function listProblem(items: string[], maxItems: number, maxLength: number, noun: string) {
  if (items.length > maxItems) return `Use up to ${maxItems} ${noun}.`;
  if (items.some((item) => item.length > maxLength)) {
    return `Keep each one under ${maxLength} characters.`;
  }
  return null;
}

/** Why an image link can't be used, or null when it can. */
export function imageUrlProblem(value: string, hosts: string[]): string | null {
  if (value.length > 2000) return "That link is too long.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full link, starting with https://.";
  }
  if (url.protocol !== "https:") return "Use a link that starts with https://.";
  if (!hosts.includes(url.host)) {
    return `Images can only come from ${hosts.join(", ")}. Other hosts need adding first.`;
  }
  return null;
}
