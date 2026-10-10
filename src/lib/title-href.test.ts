import { describe, expect, it } from "vitest";
import { titleHref } from "@/lib/title-href";

describe("titleHref", () => {
  it("routes by type", () => {
    expect(titleHref({ id: "wildflower", type: "movie" })).toBe("/movie/wildflower");
    expect(titleHref({ id: "the-brownstone", type: "series" })).toBe("/series/the-brownstone");
  });

  it("sends episodes to the episode page, not the series page", () => {
    expect(
      titleHref({ id: "the-brownstone-season-1-episode-1", type: "series", kind: "episode" })
    ).toBe("/episode/the-brownstone-season-1-episode-1");
  });
});
