import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEpisode, importSeriesSeasonsAction } from "./admin-catalog-actions";
import * as tmdb from "./tmdb";

const mockEpisodeCreate = vi.fn();
const mockVideoSourceCreate = vi.fn();
const mockMediaFindUnique = vi.fn();
const mockEpisodeFindUnique = vi.fn();
const mockEpisodeFindMany = vi.fn();
const mockMediaUpdate = vi.fn();
const mockEpisodeGroupBy = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/admin-guard", () => ({
  catalogSession: vi.fn().mockResolvedValue({
    session: { user: { id: "admin-1", role: "admin" } },
    allowed: true,
  }),
  FORBIDDEN_CATALOG: "Forbidden",
}));

vi.mock("@/lib/catalog-owner", () => ({
  canChange: vi.fn().mockResolvedValue(true),
  ownerOf: vi.fn(),
  GONE: "Gone",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("./tmdb", () => ({
  getTmdbSeasonDetails: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    media: {
      findUnique: (...args: unknown[]) => mockMediaFindUnique(...args),
      update: (...args: unknown[]) => mockMediaUpdate(...args),
    },
    episode: {
      findUnique: (...args: unknown[]) => mockEpisodeFindUnique(...args),
      findMany: (...args: unknown[]) => mockEpisodeFindMany(...args),
      create: (...args: unknown[]) => mockEpisodeCreate(...args),
      groupBy: (...args: unknown[]) => mockEpisodeGroupBy(...args),
    },
    videoSource: {
      create: (...args: unknown[]) => mockVideoSourceCreate(...args),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb({
        episode: {
          create: mockEpisodeCreate,
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: mockEpisodeGroupBy,
        },
        videoSource: {
          create: mockVideoSourceCreate,
        },
        media: {
          update: mockMediaUpdate,
        },
      });
    }),
  },
}));

describe("Episode default embed video sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("importSeriesSeasonsAction", () => {
    it("auto-creates default embed video source for imported episodes using series IMDb ID", async () => {
      mockMediaFindUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
        if (where.id === "fellow-travelers") {
          return {
            id: "fellow-travelers",
            type: "series",
            tmdbId: "tv/1399",
            imdbId: "tt27987047",
            trashedAt: null,
          };
        }
        return null;
      });

      mockEpisodeFindMany.mockResolvedValue([]);

      vi.mocked(tmdb.getTmdbSeasonDetails).mockResolvedValue({
        id: 101,
        season_number: 1,
        name: "Season 1",
        episodes: [
          {
            id: 201,
            episode_number: 1,
            name: "You're Wonderful",
            overview: "Hawkins Fuller and Tim Laughlin meet...",
            runtime: 55,
            air_date: "2023-10-29",
            still_path: "/still.jpg",
          },
        ],
      } as any);

      const result = await importSeriesSeasonsAction("fellow-travelers", [1]);

      expect(result.ok).toBe(true);
      expect(mockEpisodeCreate).toHaveBeenCalledTimes(1);
      expect(mockVideoSourceCreate).toHaveBeenCalledWith({
        data: {
          episodeId: "fellow-travelers-season-1-episode-1",
          label: "Server 1",
          kind: "embed",
          url: "https://gayflix.my.id/embed/tv/tt27987047/1/1",
          position: 1,
          enabled: true,
        },
      });
    });

    it("falls back to series numeric TMDB ID when IMDb ID is missing", async () => {
      mockMediaFindUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
        if (where.id === "fellow-travelers") {
          return {
            id: "fellow-travelers",
            type: "series",
            tmdbId: "tv/1399",
            imdbId: null,
            trashedAt: null,
          };
        }
        return null;
      });

      mockEpisodeFindMany.mockResolvedValue([]);

      vi.mocked(tmdb.getTmdbSeasonDetails).mockResolvedValue({
        id: 101,
        season_number: 1,
        name: "Season 1",
        episodes: [
          {
            id: 201,
            episode_number: 2,
            name: "Starman",
            overview: "Tim adjusts to life...",
            runtime: 50,
            air_date: "2023-11-05",
            still_path: "/still2.jpg",
          },
        ],
      } as any);

      const result = await importSeriesSeasonsAction("fellow-travelers", [1]);

      expect(result.ok).toBe(true);
      expect(mockVideoSourceCreate).toHaveBeenCalledWith({
        data: {
          episodeId: "fellow-travelers-season-1-episode-2",
          label: "Server 1",
          kind: "embed",
          url: "https://gayflix.my.id/embed/tv/1399/1/2",
          position: 1,
          enabled: true,
        },
      });
    });
  });

  describe("createEpisode", () => {
    it("creates default embed video source when manual episode is added", async () => {
      mockMediaFindUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
        if (where.id === "fellow-travelers") {
          return {
            id: "fellow-travelers",
            type: "series",
            trashedAt: null,
            imdbId: "tt27987047",
            tmdbId: "tv/1399",
          };
        }
        return null;
      });
      mockEpisodeFindUnique.mockResolvedValue(null);

      const formData = new FormData();
      formData.set("series", "fellow-travelers");
      formData.set("season", "1");
      formData.set("episode", "3");
      formData.set("title", "Hit Me");
      formData.set("minutes", "52");
      formData.set("airDate", "2023-11-12");
      formData.set("synopsis", "Hawk and Tim go on a road trip.");

      const result = await createEpisode({ values: {} as any, version: 1 }, formData);

      expect(result.ok).toBe(true);
      expect(mockVideoSourceCreate).toHaveBeenCalledWith({
        data: {
          episodeId: expect.stringContaining("fellow-travelers-season-1-episode-3"),
          label: "Server 1",
          kind: "embed",
          url: "https://gayflix.my.id/embed/tv/tt27987047/1/3",
          position: 1,
          enabled: true,
        },
      });
    });
  });
});
