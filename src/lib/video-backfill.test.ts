import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillDefaultVideoSources } from "./video-backfill";

const mockMediaFindMany = vi.fn();
const mockEpisodeFindMany = vi.fn();
const mockVideoSourceCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    media: {
      findMany: (...args: unknown[]) => mockMediaFindMany(...args),
    },
    episode: {
      findMany: (...args: unknown[]) => mockEpisodeFindMany(...args),
    },
    videoSource: {
      create: (...args: unknown[]) => mockVideoSourceCreate(...args),
    },
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
        media: {
          imdbId: "tt10638036",
          tmdbId: "tv/124834",
        },
        videoSources: [],
      },
      {
        id: "heartstopper-s1-e2",
        seasonNumber: 1,
        episodeNumber: 2,
        media: {
          imdbId: null,
          tmdbId: "tv/124834",
        },
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

  it("supports dryRun without writing to database", async () => {
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
    expect(mockVideoSourceCreate).not.toHaveBeenCalled();
  });
});
