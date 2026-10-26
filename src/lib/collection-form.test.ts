import { describe, expect, it } from "vitest";
import { collectionSlug, isShowing, parseCollection } from "./collection-form";

const form = (...names: string[]) => ({ has: (name: string) => names.includes(name) });

describe("parseCollection", () => {
  it("reads the fields and checkboxes", () => {
    const parsed = parseCollection(
      { title: "  Pride   Month ", description: "Queer joy.", startsAt: "2026-06-01", endsAt: "2026-06-30" },
      form("published")
    );
    expect(parsed).toEqual({
      ok: true,
      data: {
        title: "Pride Month",
        description: "Queer joy.",
        published: true,
        onHome: false,
        startsAt: new Date("2026-06-01T00:00:00Z"),
        endsAt: new Date("2026-06-30T00:00:00Z"),
      },
    });
  });

  it("leaves dates out when blank", () => {
    const parsed = parseCollection({ title: "Staff Picks" }, form());
    expect(parsed.ok && parsed.data.startsAt).toBeNull();
  });

  it("needs a title and real dates in order", () => {
    const parsed = parseCollection(
      { title: " ", startsAt: "2026-02-30", endsAt: "June" },
      form()
    );
    expect(parsed.ok ? {} : parsed.errors).toEqual({
      title: expect.any(String),
      startsAt: expect.any(String),
      endsAt: expect.any(String),
    });
    const backwards = parseCollection({ title: "X", startsAt: "2026-06-30", endsAt: "2026-06-01" }, form());
    expect(backwards.ok ? {} : backwards.errors).toEqual({ endsAt: expect.any(String) });
  });
});

describe("collectionSlug", () => {
  it("comes from the typed address, or the title", () => {
    expect(collectionSlug("", "Queer Classics & Cult Favorites")).toBe("queer-classics-and-cult-favorites");
    expect(collectionSlug("Pride 2026", "Pride Month")).toBe("pride-2026");
    expect(collectionSlug("", "日本")).toBeNull();
  });
});

describe("isShowing", () => {
  const june = { published: true, startsAt: new Date("2026-06-01T00:00:00Z"), endsAt: new Date("2026-06-30T00:00:00Z") };

  it("shows a published collection within its dates, the last day included", () => {
    expect(isShowing(june, new Date("2026-06-30T23:59:00Z"))).toBe(true);
    expect(isShowing(june, new Date("2026-05-31T23:59:00Z"))).toBe(false);
    expect(isShowing(june, new Date("2026-07-01T00:00:00Z"))).toBe(false);
  });

  it("never shows a draft; shows an undated one always", () => {
    expect(isShowing({ ...june, published: false }, new Date("2026-06-15T00:00:00Z"))).toBe(false);
    expect(isShowing({ published: true, startsAt: null, endsAt: null })).toBe(true);
  });
});
