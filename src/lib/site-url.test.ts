import { describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/site-url";

describe("siteUrl", () => {
  it("prefers SITE_URL", () => {
    expect(
      siteUrl({ SITE_URL: "https://gayflix.example", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin
    ).toBe("https://gayflix.example");
  });

  it("falls back to Vercel's production domain over https", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "gayflix.vercel.app" }).origin).toBe(
      "https://gayflix.vercel.app"
    );
  });

  it("defaults to localhost", () => {
    expect(siteUrl({ SITE_URL: "  " }).origin).toBe("http://localhost:3000");
  });
});
