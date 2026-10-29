import { describe, expect, it } from "vitest";
import {
  calculateEta,
  chunkArray,
  filterImportItems,
  generateBatchReportCsv,
} from "./imdb-batch";
import type { ImdbImportItem } from "./imdb-csv";
import type { ImdbItemImportResult } from "./admin-imdb-batch-actions";

describe("chunkArray", () => {
  it("splits an array into chunks of the given size", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const chunks = chunkArray(items, 3);
    expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it("handles empty array or chunk size larger than array", () => {
    expect(chunkArray([], 5)).toEqual([]);
    expect(chunkArray([1, 2], 5)).toEqual([[1, 2]]);
  });
});

describe("calculateEta", () => {
  it("calculates items per second and seconds remaining", () => {
    // 50 processed out of 100 in 10 seconds (10,000ms) -> 5 items/sec -> 10s remaining
    const eta = calculateEta(100, 50, 10000);
    expect(eta.itemsPerSecond).toBe(5);
    expect(eta.secondsRemaining).toBe(10);
  });

  it("returns 0 remaining when done or at start", () => {
    expect(calculateEta(100, 100, 5000).secondsRemaining).toBe(0);
    expect(calculateEta(100, 0, 1000).secondsRemaining).toBe(0);
  });
});

describe("filterImportItems", () => {
  const items: ImdbImportItem[] = [
    { imdbId: "tt1", title: "Movie 1", mediaType: "movie" },
    { imdbId: "tt2", title: "Series 1", mediaType: "series" },
    { imdbId: "tt3", title: "Movie 2", mediaType: "movie" },
  ];

  it("filters out existing IDs if skipExisting is true", () => {
    const existing = new Set(["tt1"]);
    const filtered = filterImportItems(items, { skipExisting: true, existingIds: existing, typeFilter: "all" });
    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.imdbId)).toEqual(["tt2", "tt3"]);
  });

  it("filters by media type", () => {
    const filtered = filterImportItems(items, { skipExisting: false, existingIds: new Set(), typeFilter: "movie" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.mediaType === "movie")).toBe(true);
  });
});

describe("generateBatchReportCsv", () => {
  it("generates CSV rows for results", () => {
    const results: ImdbItemImportResult[] = [
      { imdbId: "tt1", title: "Movie 1", status: "imported", mediaId: "movie-1", mediaType: "movie" },
      { imdbId: "tt2", title: "Love, Simon", status: "failed", error: "Not found on TMDB" },
    ];
    const csv = generateBatchReportCsv(results);
    expect(csv).toContain("IMDb ID,Title,Status,Media ID,Type,Error");
    expect(csv).toContain("tt1,Movie 1,imported,movie-1,movie,");
    expect(csv).toContain('tt2,"Love, Simon",failed,,,Not found on TMDB');
  });
});
