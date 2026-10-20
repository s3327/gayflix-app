import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOmdbById, getOmdbByTitle } from "@/lib/omdb";
import { retryAfterMs, SourceError } from "@/lib/source-request";
import { findOnTmdb, getTmdbDetails, searchTmdb } from "@/lib/tmdb";

/*
 * The TMDB and OMDb clients against a stand-in fetch: what they ask for,
 * where the keys go, and how they answer errors.
 */

const fetchMock = vi.fn<typeof fetch>();

function answer(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function requested(call = 0) {
  const [url, init] = fetchMock.mock.calls[call];
  return { url: new URL(String(url)), headers: new Headers(init?.headers) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TMDB_API_BASE", "");
  vi.stubEnv("OMDB_API_BASE", "");
  vi.stubEnv("TMDB_API_KEY", "0123456789abcdef");
  vi.stubEnv("OMDB_API_KEY", "omdbkey");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("TMDB", () => {
  it("sends an API key in the address", async () => {
    fetchMock.mockImplementation(async () => answer(200, { results: [{ id: 1 }], total_pages: 3, total_results: 41 }));
    expect(await searchTmdb("movie", "The Matrix", 2)).toEqual({
      results: [{ id: 1 }],
      totalPages: 3,
      totalResults: 41,
    });
    const { url, headers } = requested();
    expect(url.origin + url.pathname).toBe("https://api.themoviedb.org/3/search/movie");
    expect(url.searchParams.get("query")).toBe("The Matrix");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("include_adult")).toBe("false");
    expect(url.searchParams.get("api_key")).toBe("0123456789abcdef");
    expect(headers.has("authorization")).toBe(false);
  });

  it("sends a read access token in a header, and uses TMDB_API_BASE", async () => {
    vi.stubEnv("TMDB_API_KEY", "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.sig");
    vi.stubEnv("TMDB_API_BASE", "http://localhost:3101/tmdb/3/");
    fetchMock.mockImplementation(async () => answer(200, { id: 603 }));
    expect(await getTmdbDetails("movie", 603)).toEqual({ id: 603 });
    const { url, headers } = requested();
    expect(url.origin + url.pathname).toBe("http://localhost:3101/tmdb/3/movie/603");
    // With the trailer and the certifications (a series asks for content_ratings).
    expect(url.searchParams.get("append_to_response")).toBe(
      "credits,keywords,external_ids,videos,release_dates"
    );
    expect(url.searchParams.has("api_key")).toBe(false);
    expect(headers.get("authorization")).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.sig");
  });

  it("finds by IMDb id, and reads odd answers as empty", async () => {
    fetchMock.mockImplementation(async () => answer(200, { movie_results: [{ id: 603 }], tv_results: "?" }));
    expect(await findOnTmdb("tt0133093")).toEqual({ movies: [{ id: 603 }], series: [] });
    expect(requested().url.searchParams.get("external_source")).toBe("imdb_id");
  });

  it("answers null for a title TMDB doesn't have", async () => {
    fetchMock.mockImplementation(async () => answer(404, { status_code: 34 }));
    expect(await getTmdbDetails("tv", 1)).toBeNull();
    expect(requested().url.searchParams.get("append_to_response")).toBe(
      "credits,keywords,external_ids,videos,content_ratings"
    );
  });

  it("says what went wrong", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    await expect(searchTmdb("movie", "x", 1)).rejects.toThrow("TMDB_API_KEY isn't set.");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("TMDB_API_KEY", "bad");
    fetchMock.mockResolvedValueOnce(answer(401, { status_code: 7 }));
    await expect(searchTmdb("movie", "x", 1)).rejects.toThrow(/refused the key/);
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 503 }));
    await expect(searchTmdb("movie", "x", 1)).rejects.toThrow("TMDB didn't answer. Try again in a minute.");
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(searchTmdb("movie", "x", 1)).rejects.toBeInstanceOf(SourceError);
  });

  it("retries a 429 once, after the wait TMDB asks for", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(answer(429, {}, { "Retry-After": "2" }))
      .mockResolvedValueOnce(answer(200, { results: [], total_pages: 0, total_results: 0 }));
    const search = searchTmdb("tv", "Pose", 1);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(search).resolves.toEqual({ results: [], totalPages: 0, totalResults: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => answer(429, {}, { "Retry-After": "1" }));
    const again = searchTmdb("tv", "Pose", 1);
    const failed = expect(again).rejects.toThrow(/slow down/);
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't wait out a long Retry-After", async () => {
    fetchMock.mockImplementation(async () => answer(429, {}, { "Retry-After": "60" }));
    await expect(searchTmdb("tv", "Pose", 1)).rejects.toThrow(/slow down/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryAfterMs(null)).toBe(1000);
    expect(retryAfterMs("soon")).toBe(1000);
  });
});

describe("OMDb", () => {
  it("looks titles up by id or by title and year", async () => {
    fetchMock.mockImplementation(async () => answer(200, { Response: "True", imdbID: "tt0133093" }));
    expect(await getOmdbById("tt0133093")).toEqual({ Response: "True", imdbID: "tt0133093" });
    let { url } = requested(0);
    expect(url.origin + url.pathname).toBe("https://www.omdbapi.com/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ i: "tt0133093", plot: "full", apikey: "omdbkey" });

    await getOmdbByTitle("Pose", 2018);
    ({ url } = requested(1));
    expect(Object.fromEntries(url.searchParams)).toEqual({ t: "Pose", y: "2018", plot: "full", apikey: "omdbkey" });
  });

  it("answers null for a title it doesn't have", async () => {
    fetchMock.mockImplementation(async () => answer(200, { Response: "False", Error: "Movie not found!" }));
    expect(await getOmdbByTitle("Nothing", null)).toBeNull();
  });

  it("says when the daily limit is used up or the key is refused", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { Response: "False", Error: "Request limit reached!" }));
    await expect(getOmdbById("tt0133093")).rejects.toThrow("OMDb's daily limit is used up.");
    fetchMock.mockResolvedValueOnce(answer(401, { Response: "False", Error: "Invalid API key!" }));
    await expect(getOmdbById("tt0133093")).rejects.toThrow("OMDb refused the key in OMDB_API_KEY.");
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 500 }));
    await expect(getOmdbById("tt0133093")).rejects.toThrow("OMDb didn't answer.");

    vi.stubEnv("OMDB_API_KEY", " ");
    await expect(getOmdbById("tt0133093")).rejects.toThrow("OMDB_API_KEY isn't set.");
  });
});
