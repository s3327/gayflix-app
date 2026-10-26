import { describe, expect, it } from "vitest";
import {
  editDistance,
  escapeLike,
  fuzzyDistance,
  fuzzyMatches,
  MAX_QUERY_LENGTH,
  normalizeQuery,
  queryYear,
} from "@/lib/search";

// The queries themselves run in the database; e2e/catalog.spec.ts covers
// them end to end.

describe("normalizeQuery", () => {
  it("trims and caps the query", () => {
    expect(normalizeQuery("  loud  ")).toBe("loud");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("treats a blank query as no search", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("escapeLike", () => {
  it("makes LIKE wildcards and the escape character match themselves", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves everything else alone", () => {
    expect(escapeLike("Chosen Family: Reunion")).toBe("Chosen Family: Reunion");
  });
});

describe("queryYear", () => {
  it("reads a four-digit query as a year", () => {
    expect(queryYear("2026")).toBe(2026);
  });

  it("ignores anything else", () => {
    expect(queryYear("202")).toBeNull();
    expect(queryYear("20266")).toBeNull();
    expect(queryYear("2026 drama")).toBeNull();
  });
});

describe("editDistance", () => {
  it("counts added, dropped, changed and swapped letters", () => {
    expect(editDistance("family", "family")).toBe(0);
    expect(editDistance("famly", "family")).toBe(1);
    expect(editDistance("faimly", "family")).toBe(1);
    expect(editDistance("famliy", "family")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("stops past the most it's asked about", () => {
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
    expect(editDistance("a", "abcdefgh", 2)).toBe(3);
  });
});

describe("fuzzyDistance", () => {
  it("finds titles despite a typo or two", () => {
    expect(fuzzyDistance("chosen famly", "Chosen Family")).toBe(1);
    expect(fuzzyDistance("brownstome", "The Brownstone")).toBe(1);
    expect(fuzzyDistance("browmst", "The Brownstone")).toBe(1);
    expect(fuzzyDistance("José", "jose garcia")).toBe(0);
  });

  it("allows no typos in very short queries, and not too many in longer ones", () => {
    expect(fuzzyDistance("lov", "Love")).toBeNull();
    expect(fuzzyDistance("famxyz", "Chosen Family")).toBeNull();
  });
});

describe("fuzzyMatches", () => {
  it("lists the closest first, then the shortest", () => {
    const titles = ["The Brownstone", "Brownstone Nights", "Chosen Family", "Brownie"];
    expect(fuzzyMatches("brownstne", titles, (title) => title, 5)).toEqual([
      "The Brownstone",
      "Brownstone Nights",
    ]);
  });
});
