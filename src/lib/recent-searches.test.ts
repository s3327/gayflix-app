import { describe, expect, it } from "vitest";
import { MAX_RECENT_SEARCHES, withRecentSearch } from "./recent-searches";

describe("withRecentSearch", () => {
  it("puts the newest first, once whatever its case", () => {
    expect(withRecentSearch(["drama", "Heartstopper"], "  heartstopper ")).toEqual(["heartstopper", "drama"]);
  });

  it("keeps the last few only", () => {
    const list = Array.from({ length: MAX_RECENT_SEARCHES }, (_, i) => `query ${i}`);
    const next = withRecentSearch(list, "new");
    expect(next).toHaveLength(MAX_RECENT_SEARCHES);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`query ${MAX_RECENT_SEARCHES - 1}`);
  });

  it("ignores a blank search", () => {
    expect(withRecentSearch(["drama"], "   ")).toEqual(["drama"]);
  });
});
