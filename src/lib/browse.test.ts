import { describe, expect, it } from "vitest";
import {
  browseHref,
  browseLabel,
  decadesOf,
  EMPTY_QUERY,
  parseBrowse,
  yearRange,
  type BrowseOptions,
} from "@/lib/browse";

const OPTIONS: BrowseOptions = {
  genres: ["Comedy", "Drama"],
  years: [2024, 2019, 2018, 1999],
  countries: ["Canada", "United States"],
  languages: ["English", "French"],
};

describe("parseBrowse", () => {
  it("reads every filter and the sort", () => {
    const { query, ignored } = parseBrowse(
      {
        type: "series",
        genre: "Drama",
        year: "2010s",
        country: "Canada",
        language: "French",
        sort: "title",
      },
      OPTIONS
    );
    expect(query).toEqual({
      type: "series",
      genre: "Drama",
      year: "2010s",
      country: "Canada",
      language: "French",
      sort: "title",
    });
    expect(ignored).toEqual([]);
  });

  it("matches choices without regard to case", () => {
    const { query } = parseBrowse({ genre: "drama", country: "united states" }, OPTIONS);
    expect(query.genre).toBe("Drama");
    expect(query.country).toBe("United States");
  });

  it("leaves out, and lists, values that aren't choices", () => {
    const { query, ignored } = parseBrowse(
      { genre: "Western", year: "1980s", type: "short", language: "English" },
      OPTIONS
    );
    expect(query).toEqual({ ...EMPTY_QUERY, language: "English" });
    expect(ignored).toEqual([
      { facet: "type", value: "short" },
      { facet: "genre", value: "Western" },
      { facet: "year", value: "1980s" },
    ]);
  });

  it("takes a single year as well as a decade", () => {
    expect(parseBrowse({ year: "2024" }, OPTIONS).query.year).toBe("2024");
    expect(parseBrowse({ year: "2023" }, OPTIONS).ignored).toHaveLength(1);
  });

  it("falls back to the default sort, and ignores blanks", () => {
    const { query, ignored } = parseBrowse({ sort: "nope", genre: "", year: " " }, OPTIONS);
    expect(query).toEqual(EMPTY_QUERY);
    expect(ignored).toEqual([]);
  });
});

describe("browseHref", () => {
  it("writes only what's set, and the page past the first", () => {
    expect(browseHref(EMPTY_QUERY)).toBe("/browse");
    expect(browseHref({ ...EMPTY_QUERY, genre: "Sci-Fi & Fantasy", sort: "added" }, 3)).toBe(
      "/browse?genre=Sci-Fi+%26+Fantasy&sort=added&page=3"
    );
  });

  it("round-trips through parseBrowse", () => {
    const query = { ...EMPTY_QUERY, type: "movie" as const, year: "2020s", country: "Canada" };
    const params = Object.fromEntries(new URL(browseHref(query), "https://x").searchParams);
    expect(parseBrowse(params, OPTIONS).query).toEqual(query);
  });
});

describe("browseLabel", () => {
  it("names the filters in reading order", () => {
    expect(browseLabel({ ...EMPTY_QUERY, genre: "Drama", type: "movie", year: "2020s" })).toBe(
      "Drama · Movies · 2020s"
    );
    expect(browseLabel(EMPTY_QUERY)).toBe("");
  });
});

describe("years", () => {
  it("groups years into decades, newest first", () => {
    expect(decadesOf(OPTIONS.years)).toEqual([2020, 2010, 1990]);
  });

  it("reads decades and single years", () => {
    expect(yearRange("2020s")).toEqual({ from: 2020, to: 2029 });
    expect(yearRange("1999")).toEqual({ from: 1999, to: 1999 });
    expect(yearRange("2021s")).toBeNull();
    expect(yearRange("soon")).toBeNull();
  });
});
