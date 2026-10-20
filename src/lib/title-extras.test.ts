import { describe, expect, it } from "vitest";
import {
  contentNotesLabel,
  maturityFromTmdb,
  maturityLabel,
  parseContentNotes,
  parseMaturity,
  trailerEmbedUrl,
  trailerFromTmdb,
  youtubeId,
} from "@/lib/title-extras";

describe("youtubeId", () => {
  it("reads YouTube's link shapes", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      expect(youtubeId(link), link).toBe("dQw4w9WgXcQ");
    }
  });

  it("refuses anything else", () => {
    for (const link of [
      "",
      "dQw4w9WgXcQ",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://vimeo.com/123",
      "https://www.youtube.com/watch?v=short",
      "https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(youtubeId(link), link).toBeNull();
    }
  });

  it("plays through YouTube's privacy-enhanced player", () => {
    expect(trailerEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0"
    );
    expect(trailerEmbedUrl("https://vimeo.com/1")).toBeNull();
  });
});

describe("maturity ratings and content notes", () => {
  it("takes the ratings offered", () => {
    expect(parseMaturity("16")).toBe("16");
    expect(parseMaturity("")).toBeNull();
    expect(parseMaturity("21")).toBeUndefined();
  });

  it("labels them", () => {
    expect(maturityLabel("all")).toBe("All ages");
    expect(maturityLabel("18")).toBe("18+");
  });

  it("takes the content notes offered, in the list's order, once each", () => {
    expect(parseContentNotes("language, sex,sex")).toEqual(["sex", "language"]);
    expect(parseContentNotes("")).toEqual([]);
    expect(parseContentNotes("sex,gore")).toBeNull();
  });

  it("says what a title contains", () => {
    expect(contentNotesLabel(["sex", "queerphobia"])).toBe("Sex, homophobia or transphobia");
    expect(contentNotesLabel([])).toBe("");
  });
});

describe("from TMDB", () => {
  it("rates a movie by its US certification", () => {
    const details = {
      release_dates: {
        results: [
          { iso_3166_1: "GB", release_dates: [{ certification: "15" }] },
          { iso_3166_1: "US", release_dates: [{ certification: "" }, { certification: "R" }] },
        ],
      },
    };
    expect(maturityFromTmdb("movie", details)).toBe("18");
    expect(
      maturityFromTmdb("movie", { release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }] } })
    ).toBe("13");
  });

  it("rates a series by its US content rating", () => {
    const details = { content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-14" }] } };
    expect(maturityFromTmdb("tv", details)).toBe("16");
    expect(maturityFromTmdb("tv", { content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] } })).toBe("18");
  });

  it("leaves the rating empty without a US one", () => {
    expect(maturityFromTmdb("movie", {})).toBe("");
    expect(maturityFromTmdb("tv", { content_ratings: { results: [{ iso_3166_1: "FR", rating: "16" }] } })).toBe("");
  });

  it("picks the official YouTube trailer", () => {
    const details = {
      videos: {
        results: [
          { site: "YouTube", type: "Teaser", key: "aaaaaaaaaaa", official: true },
          { site: "Vimeo", type: "Trailer", key: "123", official: true },
          { site: "YouTube", type: "Trailer", key: "bbbbbbbbbbb", official: false },
          { site: "YouTube", type: "Trailer", key: "ccccccccccc", official: true },
        ],
      },
    };
    expect(trailerFromTmdb(details)).toBe("https://www.youtube.com/watch?v=ccccccccccc");
    expect(trailerFromTmdb({ videos: { results: [] } })).toBe("");
  });
});
