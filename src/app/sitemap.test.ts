import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { findBasicTitle } from "@/lib/find-basic-title";
import { mediaItems } from "@/lib/mock-media";
import { titleHref } from "@/lib/title-href";

describe("sitemap", () => {
  const urls = sitemap().map((entry) => new URL(entry.url).pathname);

  it("lists every published title", () => {
    for (const item of mediaItems.filter((media) => media.status === "published")) {
      expect(urls).toContain(titleHref(item));
    }
    expect(urls).toContain("/movie/chosen-family");
  });

  it("only lists title pages that resolve", () => {
    const titlePaths = urls.filter((path) => /^\/(movie|series)\/./.test(path));
    expect(titlePaths.length).toBeGreaterThan(100);
    for (const path of titlePaths) {
      expect(findBasicTitle(path.split("/")[2])).toBeDefined();
    }
  });

  it("never lists drafts", () => {
    const drafts = mediaItems.filter((media) => media.status === "draft");
    expect(drafts.length).toBeGreaterThan(0);
    for (const item of drafts) {
      if (findBasicTitle(item.id)) continue; // same id published elsewhere
      expect(urls).not.toContain(titleHref(item));
    }
  });

  it("leaves out admin and per-user pages", () => {
    expect(urls.some((path) => /^\/(admin|account|list|login|signup)/.test(path))).toBe(false);
  });
});
