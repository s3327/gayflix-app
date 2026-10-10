import { describe, expect, it } from "vitest";
import { cleanListName, isMediaId, MAX_LIST_NAME_LENGTH, parseEntry } from "@/lib/library-types";

const entry = {
  id: "chosen-family",
  title: "Chosen Family",
  year: 2024,
  duration: "1h 52m",
  type: "movie",
  genre: "Drama",
  posterUrl: "https://picsum.photos/seed/x/500/750",
  gradient: "from-brand-pink via-brand-orange to-pride-purple",
};

describe("parseEntry", () => {
  it("keeps a valid snapshot and drops unknown fields", () => {
    expect(parseEntry({ ...entry, admin: true, kind: "episode" })).toEqual({
      ...entry,
      kind: "episode",
    });
  });

  it("allows the optional fields to be missing", () => {
    const { posterUrl, gradient, ...bare } = entry;
    void posterUrl;
    void gradient;
    expect(parseEntry(bare)).toEqual(bare);
  });

  it("rejects malformed snapshots", () => {
    for (const bad of [
      null,
      "chosen-family",
      { ...entry, id: "" },
      { ...entry, id: "../admin" },
      { ...entry, title: "x".repeat(201) },
      { ...entry, year: "2024" },
      { ...entry, year: 2024.5 },
      { ...entry, type: "podcast" },
      { ...entry, kind: "trailer" },
    ]) {
      expect(parseEntry(bad)).toBeNull();
    }
  });

  it("only accepts https or same-site posters", () => {
    expect(parseEntry({ ...entry, posterUrl: "/posters/a.jpg" })).not.toBeNull();
    for (const posterUrl of [
      "javascript:alert(1)",
      "http://picsum.photos/a.jpg",
      "//evil.example/a.jpg",
      "/\\evil.example/a.jpg",
      "data:image/png;base64,AAAA",
    ]) {
      expect(parseEntry({ ...entry, posterUrl })).toBeNull();
    }
  });

  it("only accepts gradient stops as the gradient", () => {
    expect(parseEntry({ ...entry, gradient: "from-pride-blue to-brand-pink" })).not.toBeNull();
    for (const gradient of ["fixed inset-0 z-50", "from-pink to-blue extra", "from-[url(x)]"]) {
      expect(parseEntry({ ...entry, gradient })).toBeNull();
    }
  });
});

describe("isMediaId", () => {
  it("accepts slugs and rejects anything else", () => {
    expect(isMediaId("the-brownstone-season-1-episode-1")).toBe(true);
    expect(isMediaId("a/b")).toBe(false);
    expect(isMediaId("x".repeat(201))).toBe(false);
    expect(isMediaId(42)).toBe(false);
  });
});

describe("cleanListName", () => {
  it("trims and caps the name", () => {
    expect(cleanListName("  Weekend  ")).toBe("Weekend");
    expect(cleanListName("x".repeat(100))).toHaveLength(MAX_LIST_NAME_LENGTH);
  });

  it("falls back when the name is empty or not a string", () => {
    expect(cleanListName("   ")).toBe("Untitled List");
    expect(cleanListName(undefined)).toBe("Untitled List");
  });
});
