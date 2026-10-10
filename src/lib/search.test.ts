import { describe, expect, it } from "vitest";
import { getSuggestions, MAX_SUGGESTIONS } from "@/lib/search";
import { mediaItems, publishedMediaItems } from "@/lib/mock-media";
import type { Media } from "@/lib/media";

const item = (title: string): Media => ({
  id: title.toLowerCase().replace(/\s+/g, "-"),
  title,
  year: 2024,
  duration: "1h 40m",
  type: "movie",
  genre: "Drama",
  posterUrl: "https://picsum.photos/seed/x/500/750",
});

describe("getSuggestions", () => {
  const catalog = [item("The Loud House"), item("Loud"), item("Quiet"), item("Aloud Again")];

  it("ranks prefix matches before substring matches, alphabetized", () => {
    expect(getSuggestions("loud", catalog).map((s) => s.title)).toEqual([
      "Loud",
      "Aloud Again",
      "The Loud House",
    ]);
  });

  it("returns nothing for blank queries", () => {
    expect(getSuggestions("   ", catalog)).toEqual([]);
  });

  it("only returns the fields the header needs", () => {
    expect(Object.keys(getSuggestions("quiet", catalog)[0]).sort()).toEqual(
      ["id", "posterUrl", "title", "type", "year"]
    );
  });

  it("caps the number of results", () => {
    const many = Array.from({ length: 20 }, (_, i) => item(`Match ${i}`));
    expect(getSuggestions("match", many)).toHaveLength(MAX_SUGGESTIONS);
  });

  it("never suggests drafts from the real catalog", () => {
    const drafts = mediaItems.filter((m) => m.status === "draft");
    expect(drafts.length).toBeGreaterThan(0);
    const publishedIds = new Set(publishedMediaItems.map((m) => m.id));
    for (const draft of drafts) {
      for (const suggestion of getSuggestions(draft.title)) {
        expect(publishedIds.has(suggestion.id)).toBe(true);
      }
    }
  });
});
