import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTitle } from "./title-store";
import type { TitleInput } from "./title-form";

const mockMediaCreate = vi.fn();
const mockVideoSourceCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb({
        media: {
          create: mockMediaCreate,
        },
        videoSource: {
          create: mockVideoSourceCreate,
        },
        $executeRaw: vi.fn(),
      });
    }),
    media: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    episode: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe("insertTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleInput: TitleInput = {
    title: "Weekend",
    status: "draft",
    featured: false,
    year: 2011,
    releaseDate: "2011-09-22",
    runtimeMinutes: 97,
    genres: ["Drama", "Romance"],
    country: "United Kingdom",
    language: "English",
    synopsis: "After a drunken house party with his straight mates...",
    tagline: "A (short) story about love.",
    rating: "18",
    credit: "Andrew Haigh",
    cast: ["Tom Cullen", "Chris New"],
    tags: ["gay", "romance"],
  };

  it("creates a movie media record and default embed video source using imdbId as primary", async () => {
    const id = await insertTitle("movie", sampleInput, {
      imdbId: "tt1723816",
      tmdbId: 78586,
    });

    expect(id).toBeDefined();
    expect(mockMediaCreate).toHaveBeenCalledTimes(1);
    expect(mockVideoSourceCreate).toHaveBeenCalledWith({
      data: {
        mediaId: id,
        label: "Server 1",
        kind: "embed",
        url: "https://gayflix.my.id/embed/movie/tt1723816",
        position: 1,
        enabled: true,
      },
    });
  });

  it("falls back to numeric TMDB ID when IMDb ID is not provided", async () => {
    const id = await insertTitle("movie", sampleInput, {
      tmdbId: 78586,
    });

    expect(mockVideoSourceCreate).toHaveBeenCalledWith({
      data: {
        mediaId: id,
        label: "Server 1",
        kind: "embed",
        url: "https://gayflix.my.id/embed/movie/78586",
        position: 1,
        enabled: true,
      },
    });
  });

  it("does not create a default video source for series on title insert (episodes get video sources)", async () => {
    await insertTitle("series", { ...sampleInput, runtimeMinutes: null }, {
      imdbId: "tt0944947",
      tmdbId: 1399,
    });

    expect(mockMediaCreate).toHaveBeenCalledTimes(1);
    expect(mockVideoSourceCreate).not.toHaveBeenCalled();
  });

  it("does not create video source when neither IMDb nor TMDB ID is provided", async () => {
    await insertTitle("movie", sampleInput);

    expect(mockMediaCreate).toHaveBeenCalledTimes(1);
    expect(mockVideoSourceCreate).not.toHaveBeenCalled();
  });
});
