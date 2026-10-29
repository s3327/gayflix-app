import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkExistingImdbBatch, importImdbBatchChunk } from "./admin-imdb-batch-actions";
import * as tmdb from "./tmdb";
import * as titleStore from "./title-store";

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/lib/admin-guard", () => ({
  catalogSession: vi.fn().mockResolvedValue({
    session: { user: { id: "admin-1", role: "admin", email: "admin@example.com" } },
    allowed: true,
  }),
  FORBIDDEN_CATALOG: "Forbidden",
}));

vi.mock("@/lib/db", () => ({
  db: {
    media: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUnique: vi.fn(),
    },
    episode: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./tmdb", () => ({
  findOnTmdb: vi.fn(),
  getTmdbDetails: vi.fn(),
}));

vi.mock("./omdb", () => ({
  omdbConfigured: vi.fn().mockReturnValue(false),
  getOmdbById: vi.fn(),
}));

vi.mock("./title-store", () => ({
  insertTitle: vi.fn(),
  isUniqueViolation: vi.fn().mockReturnValue(false),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("checkExistingImdbBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing IMDb IDs present in database", async () => {
    mockFindMany.mockResolvedValue([
      { imdbId: "tt17076682" },
      { imdbId: "tt21110704" },
    ]);

    const res = await checkExistingImdbBatch(["tt17076682", "tt21110704", "tt99999999"]);
    expect(res.ok).toBe(true);
    expect(res.existingImdbIds).toEqual(["tt17076682", "tt21110704"]);
  });
});

describe("importImdbBatchChunk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips title if imdbId already exists in database", async () => {
    mockFindFirst.mockResolvedValue({
      id: "concerned-citizen",
      title: "Concerned Citizen",
      imdbId: "tt17076682",
    });

    const res = await importImdbBatchChunk([
      { imdbId: "tt17076682", title: "Concerned Citizen", mediaType: "movie" },
    ]);

    expect(res.ok).toBe(true);
    expect(res.alreadyExistsCount).toBe(1);
    expect(res.results[0].status).toBe("already_exists");
    expect(titleStore.insertTitle).not.toHaveBeenCalled();
  });

  it("imports title from TMDB and saves as draft", async () => {
    mockFindFirst.mockResolvedValue(null);
    vi.mocked(tmdb.findOnTmdb).mockResolvedValue({
      movies: [{ id: 938472, title: "Concerned Citizen" }],
      series: [],
    } as unknown as { movies: { id: number; title: string }[]; series: never[] });
    vi.mocked(tmdb.getTmdbDetails).mockResolvedValue({
      id: 938472,
      title: "Concerned Citizen",
      release_date: "2022-06-02",
      runtime: 82,
      genres: [{ name: "Comedy" }, { name: "Drama" }],
      origin_country: ["IL"],
      original_language: "he",
      overview: "A man plants a tree in his neighborhood.",
      poster_path: "/test.jpg",
      backdrop_path: "/backdrop.jpg",
      credits: { crew: [{ job: "Director", name: "Idan Haguel" }], cast: [] },
      keywords: { keywords: [] },
    });
    vi.mocked(titleStore.insertTitle).mockResolvedValue("concerned-citizen");

    const res = await importImdbBatchChunk([
      { imdbId: "tt17076682", title: "Concerned Citizen", mediaType: "movie", year: 2022 },
    ]);

    expect(res.ok).toBe(true);
    expect(res.importedCount).toBe(1);
    expect(res.results[0].status).toBe("imported");
    expect(res.results[0].mediaId).toBe("concerned-citizen");

    expect(titleStore.insertTitle).toHaveBeenCalledWith(
      "movie",
      expect.objectContaining({
        title: "Concerned Citizen",
        status: "draft",
        year: 2022,
        runtimeMinutes: 82,
      }),
      { tmdbId: "movie/938472", imdbId: "tt17076682" }
    );
  });

  it("handles TMDB not found gracefully", async () => {
    mockFindFirst.mockResolvedValue(null);
    vi.mocked(tmdb.findOnTmdb).mockResolvedValue({
      movies: [],
      series: [],
    } as unknown as { movies: never[]; series: never[] });

    const res = await importImdbBatchChunk([
      { imdbId: "tt99999999", title: "Nonexistent Movie", mediaType: "movie" },
    ]);

    expect(res.ok).toBe(true);
    expect(res.failedCount).toBe(1);
    expect(res.results[0].status).toBe("failed");
    expect(res.results[0].error).toContain("Not found");
  });
});
