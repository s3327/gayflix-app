import { describe, expect, it } from "vitest";
import { imageHosts } from "@/lib/image-hosts.mjs";
import {
  emptyTitleValues,
  episodeDurationMinutes,
  episodeId,
  episodeValues,
  gradientFor,
  imageUrlProblem,
  movieDuration,
  movieDurationMinutes,
  parseEpisode,
  parseTitle,
  seriesDuration,
  slugify,
  splitList,
  titleValues,
  type EpisodeValues,
  type TitleValues,
} from "@/lib/title-form";

const NOW = new Date("2026-10-10T12:00:00Z");
const HOSTS = ["picsum.photos", "image.example.com"];

function movie(overrides: Partial<TitleValues> = {}): TitleValues {
  return {
    ...emptyTitleValues(),
    title: "Chosen Family",
    year: "2026",
    runtime: "112",
    genres: "Drama, Comedy",
    country: "Canada",
    language: "English",
    posterUrl: "https://picsum.photos/seed/x/500/750",
    ...overrides,
  };
}

function parse(values: TitleValues, type: "movie" | "series" = "movie") {
  return parseTitle(type, values, { now: NOW, hosts: HOSTS });
}

describe("parseTitle", () => {
  it("accepts a complete movie and tidies the lists", () => {
    const result = parse(
      movie({
        genres: " Drama ,comedy, drama,, ",
        cast: "Ana Lima,  Jo  Park ",
        rating: "4.25",
        releaseDate: "2026-06-20",
        featured: "on",
        status: "published",
      })
    );
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        title: "Chosen Family",
        year: 2026,
        runtimeMinutes: 112,
        genres: ["Drama", "comedy"],
        cast: ["Ana Lima", "Jo Park"],
        rating: 4.3,
        releaseDate: new Date("2026-06-20T00:00:00Z"),
        credit: null,
        backdropUrl: null,
        featured: true,
        status: "published",
      }),
    });
  });

  it("says what's missing", () => {
    const result = parse(emptyTitleValues());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      ["country", "genres", "language", "posterUrl", "runtime", "title", "year"].sort()
    );
  });

  it("only asks movies for a runtime", () => {
    const result = parse(movie({ runtime: "" }), "series");
    expect(result.ok && result.data.runtimeMinutes).toBeNull();
  });

  it("rejects years, dates and ratings out of range", () => {
    const result = parse(movie({ year: "2032", releaseDate: "2026-02-30", rating: "6" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.year).toBe("Enter a year from 1888 to 2031.");
    expect(result.errors.releaseDate).toBeDefined();
    expect(result.errors.rating).toBeDefined();
  });

  it("anything but published is a draft", () => {
    const result = parse(movie({ status: "archived" }));
    expect(result.ok && result.data.status).toBe("draft");
  });

  it("only takes posters from the allowed hosts", () => {
    const result = parse(movie({ posterUrl: "https://evil.example.org/p.jpg" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.posterUrl).toMatch(/^Images can only come from picsum\.photos/);
  });
});

describe("imageUrlProblem", () => {
  it("wants an https link on an allowed host, on its usual port", () => {
    expect(imageUrlProblem("https://image.example.com/a.jpg", HOSTS)).toBeNull();
    expect(imageUrlProblem("https://IMAGE.example.com/a.jpg", HOSTS)).toBeNull();
    expect(imageUrlProblem("http://image.example.com/a.jpg", HOSTS)).toMatch(/https/);
    expect(imageUrlProblem("image.example.com/a.jpg", HOSTS)).toMatch(/full link/);
    expect(imageUrlProblem("https://image.example.com:8443/a.jpg", HOSTS)).toMatch(/only come/);
    expect(imageUrlProblem("https://image.example.com.evil.org/a.jpg", HOSTS)).toMatch(/only come/);
  });
});

describe("imageHosts", () => {
  it("adds IMAGE_HOSTS to the sample catalog's hosts", () => {
    expect(imageHosts(undefined)).toEqual(["picsum.photos", "fastly.picsum.photos"]);
    expect(imageHosts(" Image.TMDB.org , https://cdn.example.com/posters, not a host, ")).toEqual([
      "picsum.photos",
      "fastly.picsum.photos",
      "image.tmdb.org",
      "cdn.example.com",
    ]);
  });
});

describe("titleValues", () => {
  it("fills the form from a title, working out a sample movie's runtime", () => {
    const values = titleValues({
      type: "movie",
      status: "published",
      title: "Old Movie",
      year: 2024,
      releaseDate: new Date("2024-03-01T00:00:00Z"),
      runtimeMinutes: null,
      duration: "2h 05m",
      genres: ["Drama", "Romance"],
      country: "France",
      language: "French",
      director: "Ana Lima",
      creator: null,
      cast: [],
      tags: ["LGBTQ+"],
      rating: 4.5,
      tagline: null,
      synopsis: "",
      posterUrl: "https://picsum.photos/a",
      backdropUrl: null,
      featured: false,
    });
    expect(values).toMatchObject({
      runtime: "125",
      releaseDate: "2024-03-01",
      genres: "Drama, Romance",
      credit: "Ana Lima",
      rating: "4.5",
      featured: "",
    });
    expect(parse(values).ok).toBe(true);
  });
});

describe("parseEpisode", () => {
  const episode: EpisodeValues = {
    series: "the-brownstone",
    season: "2",
    episode: "3",
    title: "Moving Day",
    minutes: "42",
    airDate: "",
  };

  it("accepts an episode", () => {
    expect(parseEpisode(episode)).toEqual({
      ok: true,
      data: {
        seriesId: "the-brownstone",
        seasonNumber: 2,
        episodeNumber: 3,
        title: "Moving Day",
        minutes: 42,
        airDate: null,
      },
    });
  });

  it("rejects bad numbers and a made-up series", () => {
    const result = parseEpisode({ ...episode, series: "../x", season: "0", episode: "1.5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["episode", "season", "series"]);
  });

  it("round-trips through episodeValues", () => {
    const values = episodeValues({
      mediaId: "the-brownstone",
      seasonNumber: 1,
      episodeNumber: 4,
      title: "Rent Day",
      duration: "42 min",
      airDate: new Date("2026-01-05T00:00:00Z"),
    });
    expect(values).toEqual({
      series: "the-brownstone",
      season: "1",
      episode: "4",
      title: "Rent Day",
      minutes: "42",
      airDate: "2026-01-05",
    });
    expect(parseEpisode(values).ok).toBe(true);
  });
});

describe("durations and addresses", () => {
  it("formats durations as cards show them", () => {
    expect(movieDuration(112)).toBe("1h 52m");
    expect(movieDuration(125)).toBe("2h 05m");
    expect(movieDuration(48)).toBe("48m");
    expect(seriesDuration(0)).toBe("");
    expect(seriesDuration(1)).toBe("1 Season");
    expect(seriesDuration(3)).toBe("3 Seasons");
  });

  it("reads them back", () => {
    expect(movieDurationMinutes("1h 52m")).toBe(112);
    expect(movieDurationMinutes("48m")).toBe(48);
    expect(movieDurationMinutes("2h")).toBe(120);
    expect(movieDurationMinutes("3 Seasons")).toBeNull();
    expect(episodeDurationMinutes("42 min")).toBe(42);
    expect(episodeDurationMinutes("soon")).toBeNull();
  });

  it("makes addresses from titles", () => {
    expect(slugify("Café & Chill!")).toBe("cafe-and-chill");
    expect(slugify("  The Brownstone: Season Two ")).toBe("the-brownstone-season-two");
    expect(slugify("東京")).toBe("");
    expect(slugify("a".repeat(100))).toHaveLength(80);
    expect(episodeId("the-brownstone", 2, 3)).toBe("the-brownstone-season-2-episode-3");
  });

  it("splits comma lists without duplicates", () => {
    expect(splitList("Drama, drama ,Comedy,,")).toEqual(["Drama", "Comedy"]);
  });

  it("gives a title the same gradient every time", () => {
    expect(gradientFor("chosen-family")).toBe(gradientFor("chosen-family"));
    expect(gradientFor("chosen-family")).toMatch(/^from-\S+ to-\S+$/);
  });
});
