import type { MediaType } from "@/lib/media";
import { maturityFromTmdb, trailerFromTmdb } from "@/lib/title-extras";
import {
  emptyTitleValues,
  slugify,
  TITLE_FIELDS,
  type TitleField,
  type TitleValues,
} from "@/lib/title-form";

/*
 * The Import page's pure half: what TMDB and OMDb say about a title,
 * turned into the admin title form's values, and the check of TMDB's
 * match against IMDb (OMDb). The requests are in src/lib/tmdb.ts and
 * src/lib/omdb.ts, the import itself in src/lib/title-import.ts.
 *
 * Nothing from a source is trusted: every value is read defensively here,
 * then parseTitle() checks the values like anything an admin types.
 */

// --- Source ids ---------------------------------------------------------------

/** TMDB numbers movies and series ("tv") separately. */
export type TmdbKind = "movie" | "tv";

export function tmdbKind(type: MediaType): TmdbKind {
  return type === "movie" ? "movie" : "tv";
}

export function kindType(kind: TmdbKind): MediaType {
  return kind === "movie" ? "movie" : "series";
}

/** A title on TMDB. Stored in media.tmdbId as "movie/603" or "tv/1399". */
export type TmdbRef = { kind: TmdbKind; id: number };

export function formatTmdbRef({ kind, id }: TmdbRef) {
  return `${kind}/${id}`;
}

export function parseTmdbRef(value: unknown): TmdbRef | null {
  const match = typeof value === "string" ? /^(movie|tv)\/([1-9]\d{0,9})$/.exec(value) : null;
  return match ? { kind: match[1] as TmdbKind, id: Number(match[2]) } : null;
}

/** "movie/603" or "tv/1399". */
export function isTmdbId(value: unknown): value is string {
  return parseTmdbRef(value) !== null;
}

/** "tt0133093". */
export function isImdbId(value: unknown): value is string {
  return typeof value === "string" && /^tt\d{7,10}$/.test(value);
}

/** The IMDb id in what an admin typed: "tt0133093", or a link to its IMDb page. */
export function findImdbId(text: string): string | null {
  return /(?:^|[^a-z0-9])(tt\d{7,10})(?![0-9])/i.exec(text)?.[1].toLowerCase() ?? null;
}

// --- Reading what a source sent -----------------------------------------------

/** Ratings from fewer votes than this mean little. */
const MIN_VOTES = 10;
const MAX_CAST = 10;

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function names(value: unknown): string[] {
  return list(value)
    .map((item) => text(field(item, "name")))
    .filter(Boolean);
}

function positiveWhole(value: unknown): string {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? String(value) : "";
}

/** "2024-06-14" when it's a real date, else "". */
function isoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? value : "";
}

/**
 * Items for one of the form's comma-separated fields: up to `max` of
 * them, each shorter than `maxLength` (longer ones are left out). Commas
 * inside an item would split it, so they go.
 */
function joinList(items: string[], max: number, maxLength: number): string {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!item || item.length > maxLength || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    kept.push(item);
    if (kept.length === max) break;
  }
  return kept.join(", ");
}

/** As many of the names as fit in `max` characters: "Lana Wachowski, Lilly Wachowski". */
function joinNames(items: string[], max: number): string {
  let joined = "";
  for (const item of items) {
    const next = joined ? `${joined}, ${item}` : item;
    if (next.length > max) break;
    joined = next;
  }
  return joined;
}

/** Cut at the last word that fits, with an ellipsis. */
function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A 0–10 score as the form's 0–5 rating, or "" from too few votes. */
function rating(score: number, votes: number): string {
  if (!Number.isFinite(score) || score <= 0 || score > 10 || !(votes >= MIN_VOTES)) return "";
  return String(Math.round(score * 5) / 10);
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

/** "US" → "United States", or "" for a code it doesn't know. */
function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  try {
    return regionNames.of(code) ?? "";
  } catch {
    return "";
  }
}

/** "en" → "English", or "" for a code it doesn't know (TMDB's "xx", say). */
function languageName(code: string): string {
  if (!/^[a-z]{2,3}$/.test(code)) return "";
  try {
    return languageNames.of(code) ?? "";
  } catch {
    return "";
  }
}

// --- TMDB ---------------------------------------------------------------------

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/** A TMDB image path ("/abc123.jpg") at one of its sizes, or "". */
export function tmdbImage(path: unknown, size: "w342" | "w780" | "w1280" | "w300"): string {
  return typeof path === "string" && /^\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/.test(path)
    ? `${TMDB_IMAGE_BASE}/${size}${path}`
    : "";
}

/** A TMDB still image path ("/abc123.jpg") for an episode, or null. */
export function tmdbStill(path: unknown): string | null {
  return typeof path === "string" && /^\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/.test(path)
    ? `${TMDB_IMAGE_BASE}/w300${path}`
    : null;
}

/** A TMDB episode's overview as its synopsis: tidied, and short enough for the episode form. */
export function tmdbEpisodeSynopsis(overview: unknown): string {
  return shorten(text(overview), 1000);
}

function yearOf(date: string): number | null {
  return /^\d{4}-/.test(date) ? Number(date.slice(0, 4)) : null;
}

/** One result on the Import page. */
export type SourceCard = {
  /** What media.tmdbId holds: "movie/603". */
  tmdbId: string;
  type: MediaType;
  title: string;
  year: number | null;
  /** A small poster on TMDB's image host, or "". */
  posterUrl: string;
  overview?: string;
  originalTitle?: string;
};

/** A TMDB search (or find) result as a card, or null when it's unusable. */
export function tmdbCard(kind: TmdbKind, result: unknown): SourceCard | null {
  const id = field(result, "id");
  const title = text(field(result, kind === "movie" ? "title" : "name"));
  if (typeof id !== "number" || !parseTmdbRef(`${kind}/${id}`) || !title) return null;
  const overview = text(field(result, "overview"));
  const originalTitle = text(field(result, kind === "movie" ? "original_title" : "original_name"));
  return {
    tmdbId: formatTmdbRef({ kind, id }),
    type: kindType(kind),
    title,
    year: yearOf(text(field(result, kind === "movie" ? "release_date" : "first_air_date"))),
    posterUrl: tmdbImage(field(result, "poster_path"), "w342"),
    ...(overview ? { overview } : {}),
    ...(originalTitle && originalTitle !== title ? { originalTitle } : {}),
  };
}

/** What the IMDb check compares on TMDB's side. */
export type TmdbFacts = {
  /** The title, then the original title when it's different. */
  titles: string[];
  year: number | null;
  type: MediaType;
  /** The IMDb id TMDB has for it, if any. */
  imdbId: string | null;
};

export function tmdbFacts(kind: TmdbKind, details: unknown): TmdbFacts {
  const movie = kind === "movie";
  const title = text(field(details, movie ? "title" : "name"));
  const original = text(field(details, movie ? "original_title" : "original_name"));
  const imdbId = text(field(field(details, "external_ids"), "imdb_id")) || text(field(details, "imdb_id"));
  return {
    titles: [title, original].filter((value, index, all) => value && all.indexOf(value) === index),
    year: yearOf(text(field(details, movie ? "release_date" : "first_air_date"))),
    type: kindType(kind),
    imdbId: isImdbId(imdbId) ? imdbId : null,
  };
}

/**
 * The title form's values from TMDB's details (fetched with credits,
 * keywords and external_ids), for a title imported as `type`: usually
 * TMDB's own type, unless IMDb disagreed and an admin picked the other.
 * Always a draft, never featured.
 */
export function tmdbValues(kind: TmdbKind, details: unknown, type: MediaType): TitleValues {
  const movie = kind === "movie";
  const values = emptyTitleValues();
  values.title = text(field(details, movie ? "title" : "name"));

  const date = isoDate(text(field(details, movie ? "release_date" : "first_air_date")));
  values.releaseDate = date;
  values.year = date.slice(0, 4);
  if (type === "movie") {
    values.runtime = movie
      ? positiveWhole(field(details, "runtime"))
      : positiveWhole(list(field(details, "episode_run_time"))[0]);
  }

  values.genres = joinList(names(field(details, "genres")), 10, 40);
  const origin = list(field(details, "origin_country")).map(text);
  const produced = list(field(details, "production_countries"));
  values.country =
    countryName(origin[0] ?? "") ||
    countryName(text(field(produced[0], "iso_3166_1"))) ||
    shortOrEmpty(text(field(produced[0], "name")), 60);
  values.language =
    languageName(text(field(details, "original_language"))) ||
    shortOrEmpty(text(field(list(field(details, "spoken_languages"))[0], "english_name")), 60);

  const credits = field(details, "credits");
  const crew = list(field(credits, "crew"));
  const credit = movie
    ? crew
        .filter((person) => text(field(person, "job")) === "Director")
        .map((person) => text(field(person, "name")))
    : names(field(details, "created_by"));
  values.credit = joinNames(credit.filter(Boolean), 120);
  values.cast = joinList(names(field(credits, "cast")), MAX_CAST, 80);
  // Movies list keywords under "keywords", series under "results".
  const keywords = field(details, "keywords");
  values.tags = joinList(names(field(keywords, movie ? "keywords" : "results")), 20, 40);

  const score = field(details, "vote_average");
  const votes = field(details, "vote_count");
  values.rating = rating(typeof score === "number" ? score : NaN, typeof votes === "number" ? votes : 0);
  values.tagline = shortOrEmpty(text(field(details, "tagline")), 200);
  values.synopsis = shorten(text(field(details, "overview")), 5000);
  values.posterUrl = tmdbImage(field(details, "poster_path"), "w780");
  values.backdropUrl = tmdbImage(field(details, "backdrop_path"), "w1280");
  values.trailerUrl = trailerFromTmdb(details);
  values.maturityRating = maturityFromTmdb(kind, details);
  return values;
}

function shortOrEmpty(value: string, max: number) {
  return value.length <= max ? value : "";
}

// --- OMDb (IMDb) --------------------------------------------------------------

/** OMDb writes "N/A" for anything it doesn't have. */
function omdbText(value: unknown): string {
  const result = text(value);
  return result === "N/A" ? "" : result;
}

function omdbList(value: unknown): string[] {
  return omdbText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** OMDb's "14 Jun 2024" as "2024-06-14", or "". */
function omdbDate(value: string): string {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(value);
  const month = match ? MONTHS.indexOf(match[2]) + 1 : 0;
  if (!match || month === 0) return "";
  return isoDate(`${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`);
}

/** The first year of OMDb's "2024", "2011–2015" or "2011–". */
function omdbYear(value: string): number | null {
  const match = /^(\d{4})/.exec(value);
  return match ? Number(match[1]) : null;
}

/** What IMDb says, through OMDb. type is null for an episode or a game. */
export type ImdbFacts = {
  imdbId: string;
  title: string;
  year: number | null;
  type: MediaType | null;
};

/** OMDb's answer, or null when it isn't a title. */
export function imdbFacts(omdb: unknown): ImdbFacts | null {
  const imdbId = omdbText(field(omdb, "imdbID"));
  const title = omdbText(field(omdb, "Title"));
  if (!isImdbId(imdbId) || !title) return null;
  const type = omdbText(field(omdb, "Type"));
  return {
    imdbId,
    title,
    year: omdbYear(omdbText(field(omdb, "Year"))),
    type: type === "movie" || type === "series" ? type : null,
  };
}

/** The title form's values from OMDb's answer, for a title imported as `type`. */
export function omdbValues(omdb: unknown, type: MediaType): TitleValues {
  const values = emptyTitleValues();
  values.title = omdbText(field(omdb, "Title"));
  const released = omdbDate(omdbText(field(omdb, "Released")));
  const year = omdbYear(omdbText(field(omdb, "Year")));
  values.releaseDate = released;
  values.year = year === null ? released.slice(0, 4) : String(year);
  if (type === "movie") {
    const runtime = /^(\d{1,3}) min$/.exec(omdbText(field(omdb, "Runtime")));
    values.runtime = runtime && Number(runtime[1]) > 0 ? runtime[1] : "";
    values.credit = joinNames(omdbList(field(omdb, "Director")), 120);
  }
  values.genres = joinList(omdbList(field(omdb, "Genre")), 10, 40);
  values.country = shortOrEmpty(omdbList(field(omdb, "Country"))[0] ?? "", 60);
  values.language = shortOrEmpty(omdbList(field(omdb, "Language"))[0] ?? "", 60);
  values.cast = joinList(omdbList(field(omdb, "Actors")), MAX_CAST, 80);
  values.rating = rating(
    Number(omdbText(field(omdb, "imdbRating"))),
    Number(omdbText(field(omdb, "imdbVotes")).replace(/,/g, ""))
  );
  values.synopsis = shorten(omdbText(field(omdb, "Plot")), 5000);
  const poster = omdbText(field(omdb, "Poster"));
  values.posterUrl = /^https:\/\/\S+$/.test(poster) && poster.length <= 2000 ? poster : "";
  return values;
}

/** Status and Featured are the admin's, never a source's. */
const SOURCE_FIELDS = TITLE_FIELDS.filter((name) => name !== "status" && name !== "featured");

/**
 * `values` with every field it leaves empty taken from `extra` (OMDb's
 * values for a TMDB title), and the names of the fields that were.
 */
export function fillGaps(values: TitleValues, extra: TitleValues) {
  const filled: TitleField[] = [];
  const result = { ...values };
  for (const name of SOURCE_FIELDS) {
    if (!result[name] && extra[name]) {
      result[name] = extra[name];
      filled.push(name);
    }
  }
  return { values: result, filled };
}

// --- The IMDb check -----------------------------------------------------------

/** Titles compared without case, accents or punctuation. */
function titleKey(title: string) {
  return slugify(title) || title.toLowerCase();
}

export type ImdbCheck = {
  /** TMDB's title or original title is IMDb's. */
  sameTitle: boolean;
  /** The years are at most one apart (or one of them is missing). */
  sameYear: boolean;
  /** IMDb has it as the same type; false for an episode or a game too. */
  sameType: boolean;
};

export function checkMatch(tmdb: TmdbFacts, imdb: ImdbFacts): ImdbCheck {
  const imdbTitle = titleKey(imdb.title);
  return {
    sameTitle: tmdb.titles.some((title) => titleKey(title) === imdbTitle),
    sameYear: tmdb.year === null || imdb.year === null || Math.abs(tmdb.year - imdb.year) <= 1,
    sameType: imdb.type === tmdb.type,
  };
}

function describe(title: string, year: number | null) {
  return `“${title}”${year === null ? "" : ` (${year})`}`;
}

/** What an admin should look at before saving, or [] when it all matches. */
export function matchNotices(tmdb: TmdbFacts, imdb: ImdbFacts, check: ImdbCheck): string[] {
  const notices: string[] = [];
  if (!check.sameTitle || !check.sameYear) {
    const tmdbSide = describe(tmdb.titles[0] ?? "", tmdb.year);
    notices.push(`Check the match: TMDB has ${tmdbSide} and IMDb has ${describe(imdb.title, imdb.year)}.`);
  }
  if (!check.sameType) {
    notices.push(
      imdb.type === null
        ? `IMDb lists ${imdb.imdbId} as neither a movie nor a series.`
        : `TMDB lists it as a ${tmdb.type} and IMDb as a ${imdb.type}.`
    );
  }
  return notices;
}
