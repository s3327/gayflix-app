import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillDefaultVideoSources } from "./video-backfill";

const mockMediaFindMany = vi.fn();
const mockEpisodeFindMany = vi.fn();
const mockVideoSourceCreate = vi.fn();

vi.mock("@/lib/database", () => ({
  database: {
    selectFrom: vi.fn((table: string) => {
      const currentTable = table;
      const chain: Record<string, unknown> = {};
      chain.innerJoin = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.execute = vi.fn(async () => {
        if (currentTable === "media") return mockMediaFindMany();
        if (currentTable === "episode") return mockEpisodeFindMany();
        return [];
      });
      return chain;
    }),
    insertInto: vi.fn(() => ({
      values: vi.fn((data: unknown) => ({
        execute: vi.fn(async () => mockVideoSourceCreate({ data })),
      })),
    })),
  },
}));

describe("backfillDefaultVideoSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backfills movies and episodes missing video sources", async () => {
    mockMediaFindMany.mockResolvedValue([
      {
        id: "challengers",
        type: "movie",
        imdbId: "tt16426418",
        tmdbId: "movie/937287",
        videoSources: [],
      },
      {
        id: "already-has-video",
        type: "movie",
        imdbId: "tt1234567",
        tmdbId: "movie/123",
        videoSources: [{ id: "vs-1" }],
      },
    ]);

    mockEpisodeFindMany.mockResolvedValue([
      {
        id: "heartstopper-s1-e1",
        seasonNumber: 1,
        episodeNumber: 1,
        imdbId: "tt10638036",
        tmdbId: "tv/124834",
        videoSources: [],
      },
      {
        id: "heartstopper-s1-e2",
        seasonNumber: 1,
        episodeNumber: 2,
        imdbId: null,
        tmdbId: "tv/124834",
        videoSources: [],
      },
    ]);

    const result = await backfillDefaultVideoSources();

    expect(result.moviesProcessed).toBe(2);
    expect(result.moviesUpdated).toBe(1);
    expect(result.episodesProcessed).toBe(2);
    expect(result.episodesUpdated).toBe(2);

    expect(mockVideoSourceCreate).toHaveBeenCalledWith({
      data: {
        mediaId: "challengers",
        label: "Server 1",
        kind: "embed",
        url: "https://gayflix.my.id/embed/movie/tt16426418",
        position: 1,
        enabled: true,
      },
    });

    expect(mockVideoSourceCreate).toHaveBeenCalledWith({
      data: {
        episodeId: "heartstopper-s1-e1",
        label: "Server 1",
        kind: "embed",
        url: "https://gayflix.my.id/embed/tv/tt10638036/1/1",
        position: 1,
        enabled: true,
      },
    });

    expect(mockVideoSourceCreate).toHaveBeenCalledWith({
      data: {
        episodeId: "heartstopper-s1-e2",
        label: "Server 1",
        kind: "embed",
        url: "https://gayflix.my.id/embed/tv/124834/1/2",
        position: 1,
        enabled: true,
      },
    });
  });

  it("respects dryRun option and does not write to database", async () => {
    mockMediaFindMany.mockResolvedValue([
      {
        id: "challengers",
        type: "movie",
        imdbId: "tt16426418",
        tmdbId: "movie/937287",
        videoSources: [],
      },
    ]);
    mockEpisodeFindMany.mockResolvedValue([]);

    const result = await backfillDefaultVideoSources({ dryRun: true });

    expect(result.moviesUpdated).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(mockVideoSourceCreate).not.toHaveBeenCalled();
  });
});
