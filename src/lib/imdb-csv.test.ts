import { describe, expect, it } from "vitest";
import { parseCsv, parseImdbExport } from "./imdb-csv";

describe("parseCsv", () => {
  it("parses comma-separated values with quotes and embedded commas", () => {
    const raw = '1,tt17076682,"Concerned Citizen","Comedy, Drama",2022\n2,tt21110704,"Háblame de ti","Drama",2022';
    const rows = parseCsv(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["1", "tt17076682", "Concerned Citizen", "Comedy, Drama", "2022"]);
    expect(rows[1][1]).toBe("tt21110704");
  });

  it("handles CRLF and escaped quotes", () => {
    const raw = 'ColA,ColB\r\n"He said ""Hello""",123\r\n';
    const rows = parseCsv(raw);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('He said "Hello"');
    expect(rows[1][1]).toBe("123");
  });

  it("handles BOM character at the start of text", () => {
    const raw = '\uFEFF"ColA",ColB\nval1,val2';
    const rows = parseCsv(raw);
    expect(rows[0][0]).toBe("ColA");
  });
});

describe("parseImdbExport", () => {
  it("parses standard IMDb watchlist/ratings export headers", () => {
    const csv = `Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated
1,tt17076682,2023-11-12,2023-11-12,,"Concerned Citizen","Ezrah Mudag",https://www.imdb.com/title/tt17076682/,Movie,6.0,82,2022,"Comedy, Drama",532,2023-06-02,"Idan Haguel",,
2,tt28642799,2023-11-12,2023-11-12,,"I Love You, and It Hurts","Te Quiero y Me Duele",https://www.imdb.com/title/tt28642799/,TV Series,5.6,,2023,"Drama",135,2023-08-17,,,
3,tt21156936,2023-11-12,2023-11-12,,"Hornbeam","Hornbeam",https://www.imdb.com/title/tt21156936/,Short,6.7,16,2022,"Short, Drama",71,2022,"Mark Pluck",,`;

    const result = parseImdbExport(csv);
    expect(result.validCount).toBe(3);
    expect(result.movieCount).toBe(2); // Movie + Short mapped to movie
    expect(result.seriesCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      imdbId: "tt17076682",
      title: "Concerned Citizen",
      originalTitle: "Ezrah Mudag",
      mediaType: "movie",
      year: 2022,
      runtimeMinutes: 82,
      directors: "Idan Haguel",
    });
    expect(result.items[1].mediaType).toBe("series");
    expect(result.items[2].mediaType).toBe("movie");
  });

  it("extracts bare IMDb ID list if plain text is provided", () => {
    const text = "tt17076682\ntt21110704\ntt17174750";
    const result = parseImdbExport(text);
    expect(result.validCount).toBe(3);
    expect(result.items[0].imdbId).toBe("tt17076682");
    expect(result.items[1].imdbId).toBe("tt21110704");
    expect(result.items[2].imdbId).toBe("tt17174750");
  });

  it("deduplicates identical IMDb IDs in input", () => {
    const text = "tt17076682\ntt17076682\ntt21110704";
    const result = parseImdbExport(text);
    expect(result.validCount).toBe(2);
    expect(result.items).toHaveLength(2);
  });
});
