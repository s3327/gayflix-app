import { getJson, SourceError } from "@/lib/source-request";
import type { TmdbKind } from "@/lib/import-mapping";

/*
 * TMDB (themoviedb.org), the Import page's main source. Server code only:
 * the requests carry TMDB_API_KEY. TMDB_API_BASE points the requests
 * somewhere else; only the end-to-end tests set it.
 */

/** Either value from TMDB's API settings page: the API key or the read access token. */
function apiKey() {
  return process.env.TMDB_API_KEY?.trim() ?? "";
}

export function tmdbConfigured() {
  return apiKey() !== "";
}

/** One TMDB search page holds 20 results, and TMDB serves pages 1 to 500. */
export const TMDB_PAGE_SIZE = 20;
export const TMDB_MAX_PAGE = 500;

/** TMDB's answer, or null for a title it doesn't have. */
async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new SourceError("TMDB_API_KEY isn't set.");
  const base = (process.env.TMDB_API_BASE || "https://api.themoviedb.org/3").replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  // The read access token (a JWT, with dots) goes in a header, which
  // keeps it out of request logs; the shorter API key can only go in the
  // address.
  const headers: Record<string, string> = {};
  if (key.includes(".")) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  const { status, body } = await getJson(url, { source: "TMDB", headers });
  if (status === 200 && body !== null && typeof body === "object") return body;
  if (status === 404) return null;
  if (status === 401) throw new SourceError("TMDB refused the key in TMDB_API_KEY. Check the setting.");
  if (status === 429) throw new SourceError("TMDB asked the site to slow down. Try again in a minute.");
  throw new SourceError("TMDB didn't answer. Try again in a minute.");
}

/** One page of TMDB's search for movies or series. */
export async function searchTmdb(kind: TmdbKind, query: string, page: number) {
  const body = await tmdbGet(`/search/${kind}`, {
    query,
    page: String(page),
    include_adult: "false",
  });
  const results = (body as { results?: unknown } | null)?.results;
  const totalPages = (body as { total_pages?: unknown } | null)?.total_pages;
  const totalResults = (body as { total_results?: unknown } | null)?.total_results;
  return {
    results: Array.isArray(results) ? (results as unknown[]) : [],
    totalPages: typeof totalPages === "number" ? Math.min(totalPages, TMDB_MAX_PAGE) : 0,
    totalResults: typeof totalResults === "number" ? totalResults : 0,
  };
}

/** The movies and series TMDB has under an IMDb id. */
export async function findOnTmdb(imdbId: string) {
  const body = await tmdbGet(`/find/${imdbId}`, { external_source: "imdb_id" });
  const movies = (body as { movie_results?: unknown } | null)?.movie_results;
  const series = (body as { tv_results?: unknown } | null)?.tv_results;
  return {
    movies: Array.isArray(movies) ? (movies as unknown[]) : [],
    series: Array.isArray(series) ? (series as unknown[]) : [],
  };
}

/**
 * A movie's or series' details with its credits, keywords, IMDb id,
 * videos (for a trailer) and certifications (release_dates for a movie,
 * content_ratings for a series), in one request. Null when TMDB doesn't
 * have it.
 */
export async function getTmdbDetails(kind: TmdbKind, id: number): Promise<unknown> {
  const ratings = kind === "movie" ? "release_dates" : "content_ratings";
  return tmdbGet(`/${kind}/${id}`, {
    append_to_response: `credits,keywords,external_ids,videos,${ratings}`,
  });
}

export type TmdbEpisode = {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview?: string;
  air_date?: string | null;
  runtime?: number | null;
  still_path?: string | null;
};

export type TmdbSeason = {
  id: number;
  season_number: number;
  name: string;
  overview?: string;
  air_date?: string | null;
  poster_path?: string | null;
  episode_count?: number;
  episodes?: TmdbEpisode[];
};

/**
 * Details of one season of a TV series on TMDB, including its episodes.
 * Returns null when not found.
 */
export async function getTmdbSeasonDetails(tvId: number, seasonNumber: number): Promise<TmdbSeason | null> {
  const body = await tmdbGet(`/tv/${tvId}/season/${seasonNumber}`);
  return (body as TmdbSeason) ?? null;
}
