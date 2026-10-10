import { describe, expect, it } from "vitest";
import { escapeLike, MAX_QUERY_LENGTH, normalizeQuery, queryYear } from "@/lib/search";

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
