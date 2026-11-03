import { describe, expect, it } from "vitest";
import type { MediaDetail } from "@/lib/media";
import { episodeMetadata, listingMetadata, shortDescription, titleMetadata } from "@/lib/page-metadata";

const BASE: MediaDetail = {
  id: "chosen-family",
  type: "movie",
  title: "Chosen Family",
  year: 2025,
  duration: "1h 52m",
  genre: "Drama",
  posterUrl: "https://picsum.photos/seed/chosen-family/500/750",
  createdAt: "2026-01-01T00:00:00.000Z",
  genres: ["Drama"],
  country: "United States",
  language: "English",
  synopsis: "Three friends turned family.",
  cast: [],
  tags: [],
  contentNotes: [],
  episodes: [],
};

describe("shortDescription", () => {
  it("keeps short text whole, with its spacing tidied", () => {
    expect(shortDescription("  One   summer\nin P-town. ")).toBe("One summer in P-town.");
  });

  it("cuts long text at a word and marks the cut", () => {
    const text = "word ".repeat(60);
    const result = shortDescription(text, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toMatch(/^word( word)*…$/);
  });

  it("doesn't leave punctuation before the ellipsis", () => {
    expect(shortDescription("Love, loss, and reinvention over one summer", 18)).toBe("Love, loss, and…");
  });
});

describe("titleMetadata", () => {
  it("names the title and year, and previews its backdrop on a large card", () => {
    const meta = titleMetadata({ ...BASE, backdropUrl: "https://example.com/wide.jpg" });
    expect(meta.title).toBe("Chosen Family (2025)");
    expect(meta.description).toBe("Three friends turned family.");
    expect(meta.alternates?.canonical).toBe("/movie/chosen-family");
    expect(meta.openGraph).toMatchObject({
      siteName: "Gayflix",
      type: "video.movie",
      url: "/movie/chosen-family",
      images: [{ url: "https://example.com/wide.jpg" }],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("falls back to the poster on a small card, and to a plain description", () => {
    const meta = titleMetadata({ ...BASE, type: "series", id: "loud-address", synopsis: "" });
    expect(meta.description).toBe("Watch Chosen Family (2025) on Gayflix.");
    expect(meta.openGraph).toMatchObject({
      type: "video.tv_show",
      url: "/series/loud-address",
      images: [{ url: BASE.posterUrl }],
    });
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });
});

describe("episodeMetadata", () => {
  it("names the series, season and episode, and uses the series' details", () => {
    const meta = episodeMetadata(
      { id: "fam-s1e2", title: "Pilot", seasonNumber: 1, episodeNumber: 2, duration: "42 min" },
      { ...BASE, type: "series" }
    );
    expect(meta.title).toBe("Chosen Family S1 E2: Pilot");
    expect(meta.description).toBe(BASE.synopsis);
    expect(meta.openGraph).toMatchObject({ type: "video.episode", url: "/episode/fam-s1e2" });
  });
});

describe("listingMetadata", () => {
  it("includes canonical, openGraph and twitter cards", () => {
    const meta = listingMetadata("Movies", "/movie", "All LGBTQ+ movies.", 1);
    expect(meta.title).toBe("Movies");
    expect(meta.description).toBe("All LGBTQ+ movies.");
    expect(meta.alternates?.canonical).toBe("/movie");
    expect(meta.openGraph).toMatchObject({
      title: "Movies",
      description: "All LGBTQ+ movies.",
      url: "/movie",
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Movies",
      description: "All LGBTQ+ movies.",
    });
  });

  it("appends page parameter on page 2+", () => {
    const meta = listingMetadata("Movies", "/movie", "All LGBTQ+ movies.", 2);
    expect(meta.title).toBe("Movies · Page 2");
    expect(meta.alternates?.canonical).toBe("/movie?page=2");
  });
});
