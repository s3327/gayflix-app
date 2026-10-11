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

  if (!values.posterUrl) errors.posterUrl = "Enter a link to the poster image.";
  else check("posterUrl", imageUrlProblem(values.posterUrl, hosts));
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
      posterUrl: values.posterUrl,
      backdropUrl: values.backdropUrl || null,
      status: values.status === "published" ? "published" : "draft",
      featured: values.featured === "on",
    },
  };
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
    posterUrl: row.posterUrl,
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

/** /episode/[id]: "the-brownstone-season-1-episode-2". */
export function episodeId(seriesId: string, season: number, episode: number) {
  return `${seriesId}-season-${season}-episode-${episode}`;
}

// --- Durations, addresses and gradients ---------------------------------------

/** A movie card's duration: "1h 52m", "2h 05m", "48m". */
export function movieDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

/** Back from "1h 52m" (or "48m", "2h") to minutes, or null. */
export function movieDurationMinutes(duration: string): number | null {
  const match = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(duration.trim());
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
