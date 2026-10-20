/*
 * A title's trailer, maturity rating and content notes: what the title
 * form takes (src/lib/title-form.ts), how TMDB's answers map onto them
 * (src/lib/import-mapping.ts) and how the title page shows them
 * (src/components/TitleDetail.tsx). No database access here.
 */

// --- Trailer -------------------------------------------------------------------

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Where trailers play from: YouTube's privacy-enhanced player (also in the CSP). */
export const TRAILER_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * The video id of a YouTube link (watch, youtu.be, embed or shorts), or
 * null for anything else. Only https links on YouTube's own hosts.
 */
export function youtubeId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  let id: string | null = null;
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** How a trailer link is stored: YouTube's plain watch link. */
export function trailerWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** The trailer's player, starting at once, without other channels' videos at the end. */
export function trailerEmbedUrl(link: string): string | null {
  const id = youtubeId(link);
  return id ? `${TRAILER_ORIGIN}/embed/${id}?autoplay=1&rel=0` : null;
}

// --- Maturity rating -------------------------------------------------------------

/** The ages a title may be rated for, youngest first. */
export const MATURITY_RATINGS = ["all", "7", "13", "16", "18"] as const;
export type MaturityRating = (typeof MATURITY_RATINGS)[number];

export function maturityLabel(rating: MaturityRating): string {
  return rating === "all" ? "All ages" : `${rating}+`;
}

/** A form's rating: the rating, null when left empty, undefined when it isn't one. */
export function parseMaturity(value: string): MaturityRating | null | undefined {
  if (!value) return null;
  return (MATURITY_RATINGS as readonly string[]).includes(value) ? (value as MaturityRating) : undefined;
}

// --- Content notes -----------------------------------------------------------------

/** What a title may be noted for, in the order they're shown. */
export const CONTENT_NOTES = [
  ["sex", "Sex"],
  ["nudity", "Nudity"],
  ["language", "Language"],
  ["violence", "Violence"],
  ["drugs", "Drug use"],
  ["self-harm", "Self-harm"],
  ["queerphobia", "Homophobia or transphobia"],
] as const;
export type ContentNote = (typeof CONTENT_NOTES)[number][0];

const NOTE_ORDER: readonly string[] = CONTENT_NOTES.map(([code]) => code);

/**
 * A form's notes ("sex,language", as the checkboxes send them): known
 * ones in the list's order, once each, or null when one isn't known.
 */
export function parseContentNotes(value: string): ContentNote[] | null {
  const codes = value
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  if (codes.some((code) => !NOTE_ORDER.includes(code))) return null;
  return NOTE_ORDER.filter((code) => codes.includes(code)) as ContentNote[];
}

/** "Sex, homophobia or transphobia": the title page's Contains line. */
export function contentNotesLabel(notes: readonly string[]): string {
  const labels = CONTENT_NOTES.filter(([code]) => notes.includes(code)).map(([, label]) => label);
  return labels.map((label, i) => (i === 0 ? label : label.toLowerCase())).join(", ");
}

// --- From TMDB -------------------------------------------------------------------

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * US certifications on the age scale, rounded up where they fall between
 * two ages (TV-14 is 16+), so a title is never rated younger than its
 * certification.
 */
const US_CERTIFICATIONS: Record<string, MaturityRating> = {
  G: "all",
  PG: "7",
  "PG-13": "13",
  R: "18",
  "NC-17": "18",
  "TV-Y": "all",
  "TV-G": "all",
  "TV-Y7": "7",
  "TV-PG": "7",
  "TV-14": "16",
  "TV-MA": "18",
};

/**
 * A title's rating from TMDB's details (with release_dates for a movie,
 * content_ratings for a series): its US certification on the age scale,
 * or "" without one.
 */
export function maturityFromTmdb(kind: "movie" | "tv", details: unknown): MaturityRating | "" {
  const us = (results: unknown) =>
    list(results).find((result) => field(result, "iso_3166_1") === "US");
  const certifications =
    kind === "movie"
      ? list(field(us(field(field(details, "release_dates"), "results")), "release_dates")).map((date) =>
          field(date, "certification")
        )
      : [field(us(field(field(details, "content_ratings"), "results")), "rating")];
  for (const certification of certifications) {
    const rating = typeof certification === "string" ? US_CERTIFICATIONS[certification.trim()] : undefined;
    if (rating) return rating;
  }
  return "";
}

/** The title's YouTube trailer from TMDB's videos, official ones first, or "". */
export function trailerFromTmdb(details: unknown): string {
  const trailers = list(field(field(details, "videos"), "results")).filter(
    (video) =>
      field(video, "site") === "YouTube" &&
      field(video, "type") === "Trailer" &&
      typeof field(video, "key") === "string" &&
      VIDEO_ID.test(field(video, "key") as string)
  );
  const best = trailers.find((video) => field(video, "official") === true) ?? trailers[0];
  return best ? trailerWatchUrl(field(best, "key") as string) : "";
}
