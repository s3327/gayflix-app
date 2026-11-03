import { describe, expect, it } from "vitest";
import type { Episode, MediaDetail } from "@/lib/media";
import {
  buildBreadcrumbJsonLd,
  buildEpisodeJsonLd,
  buildMovieJsonLd,
  buildSeriesJsonLd,
  buildWebsiteJsonLd,
  formatDurationToIso,
} from "./schema-org";

const SAMPLE_MOVIE: MediaDetail = {
  id: "m-123",
  title: "Chosen Family",
  type: "movie",
  year: 2024,
  duration: "1h 35m",
  runtimeMinutes: 95,
  genre: "Drama",
  synopsis: "A heartwarming story about chosen queer family in Seattle.",
  backdropUrl: "https://example.com/backdrop.jpg",
  posterUrl: "https://example.com/poster.jpg",
  maturityRating: "13",
  genres: ["Drama", "Comedy"],
  director: "Heather Graham",
  cast: ["Heather Graham", "Thomas Lennon", "Julia Stiles"],
  country: "United States",
  language: "English",
  tags: [],
  contentNotes: [],
  episodes: [],
  createdAt: "2024-01-01T00:00:00.000Z",
};

const SAMPLE_SERIES: MediaDetail = {
  id: "s-456",
  title: "Heartstopper",
  type: "series",
  year: 2022,
  duration: "3 Seasons",
  genre: "Drama",
  synopsis: "Teens Charlie and Nick discover their unlikely friendship might be something more.",
  backdropUrl: "https://example.com/heartstopper.jpg",
  posterUrl: "https://example.com/heartstopper-poster.jpg",
  maturityRating: "13",
  genres: ["Drama", "Romance"],
  creator: "Alice Oseman",
  cast: ["Joe Locke", "Kit Connor", "William Gao"],
  country: "United Kingdom",
  language: "English",
  tags: [],
  contentNotes: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  episodes: [
    { id: "e1", title: "Meet", seasonNumber: 1, episodeNumber: 1, duration: "28 min" },
    { id: "e2", title: "Crush", seasonNumber: 1, episodeNumber: 2, duration: "29 min" },
    { id: "e3", title: "Kiss", seasonNumber: 2, episodeNumber: 1, duration: "30 min" },
  ],
};

const SAMPLE_EPISODE: Episode = {
  id: "ep-789",
  seasonNumber: 1,
  episodeNumber: 1,
  title: "Meet",
  synopsis: "Charlie and Nick meet for the first time in homeroom.",
  stillUrl: "https://example.com/ep1.jpg",
  duration: "28 min",
};

describe("formatDurationToIso", () => {
  it("formats minutes into ISO 8601 duration", () => {
    expect(formatDurationToIso(95)).toBe("PT1H35M");
    expect(formatDurationToIso(60)).toBe("PT1H");
    expect(formatDurationToIso(45)).toBe("PT45M");
    expect(formatDurationToIso(0)).toBe("PT0M");
  });

  it("formats duration strings into ISO 8601 duration", () => {
    expect(formatDurationToIso("1h 35m")).toBe("PT1H35M");
    expect(formatDurationToIso("1h")).toBe("PT1H");
    expect(formatDurationToIso("42 min")).toBe("PT42M");
    expect(formatDurationToIso("")).toBeUndefined();
  });
});

describe("buildWebsiteJsonLd", () => {
  it("creates valid schema.org WebSite markup with SearchAction", () => {
    const jsonLd = buildWebsiteJsonLd("https://gayflix.cc");
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("WebSite");
    expect(jsonLd.name).toBe("Gayflix");
    expect(jsonLd.url).toBe("https://gayflix.cc");
    expect(jsonLd.potentialAction).toEqual({
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://gayflix.cc/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    });
  });
});

describe("buildMovieJsonLd", () => {
  it("creates valid schema.org Movie markup", () => {
    const jsonLd = buildMovieJsonLd(SAMPLE_MOVIE, "https://gayflix.cc");
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Movie");
    expect(jsonLd.name).toBe("Chosen Family");
    expect(jsonLd.url).toBe("https://gayflix.cc/movie/m-123");
    expect(jsonLd.duration).toBe("PT1H35M");
    expect(jsonLd.datePublished).toBe("2024");
    expect(jsonLd.image).toBe("https://example.com/backdrop.jpg");
    expect(jsonLd.genre).toEqual(["Drama", "Comedy"]);
    expect(jsonLd.contentRating).toBe("13");
    expect(jsonLd.director).toEqual([{ "@type": "Person", name: "Heather Graham" }]);
    expect(jsonLd.countryOfOrigin).toEqual({ "@type": "Country", name: "United States" });
    expect(jsonLd.actor).toHaveLength(3);
    expect(jsonLd.actor?.[0]).toEqual({ "@type": "Person", name: "Heather Graham" });
  });
});

describe("buildSeriesJsonLd", () => {
  it("creates valid schema.org TVSeries markup", () => {
    const jsonLd = buildSeriesJsonLd(SAMPLE_SERIES, "https://gayflix.cc");
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("TVSeries");
    expect(jsonLd.name).toBe("Heartstopper");
    expect(jsonLd.url).toBe("https://gayflix.cc/series/s-456");
    expect(jsonLd.startDate).toBe("2022");
    expect(jsonLd.numberOfSeasons).toBe(2);
    expect(jsonLd.genre).toEqual(["Drama", "Romance"]);
    expect(jsonLd.creator).toEqual([{ "@type": "Person", name: "Alice Oseman" }]);
    expect(jsonLd.countryOfOrigin).toEqual({ "@type": "Country", name: "United Kingdom" });
    expect(jsonLd.actor).toHaveLength(3);
  });
});

describe("buildEpisodeJsonLd", () => {
  it("creates valid schema.org TVEpisode markup linked to series and season", () => {
    const jsonLd = buildEpisodeJsonLd(SAMPLE_EPISODE, SAMPLE_SERIES, "https://gayflix.cc");
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("TVEpisode");
    expect(jsonLd.name).toBe("Meet");
    expect(jsonLd.duration).toBe("PT28M");
    expect(jsonLd.episodeNumber).toBe(1);
    expect(jsonLd.partOfSeason).toEqual({
      "@type": "TVSeason",
      seasonNumber: 1,
    });
    expect(jsonLd.partOfSeries).toEqual({
      "@type": "TVSeries",
      name: "Heartstopper",
      url: "https://gayflix.cc/series/s-456",
    });
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("creates valid schema.org BreadcrumbList markup", () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://gayflix.cc" },
      { name: "Movies", url: "https://gayflix.cc/movie" },
      { name: "Chosen Family", url: "https://gayflix.cc/movie/chosen-family" },
    ]);
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("BreadcrumbList");
    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gayflix.cc" },
      { "@type": "ListItem", position: 2, name: "Movies", item: "https://gayflix.cc/movie" },
      { "@type": "ListItem", position: 3, name: "Chosen Family", item: "https://gayflix.cc/movie/chosen-family" },
    ]);
  });
});
