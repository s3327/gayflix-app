import { describe, expect, it } from "vitest";
import imageLoader, { getTmdbSize } from "@/lib/image-loader";

describe("getTmdbSize", () => {
  it("maps poster widths to TMDB native poster sizes", () => {
    expect(getTmdbSize(80, false)).toBe("w92");
    expect(getTmdbSize(92, false)).toBe("w92");
    expect(getTmdbSize(100, false)).toBe("w154");
    expect(getTmdbSize(154, false)).toBe("w154");
    expect(getTmdbSize(180, false)).toBe("w185");
    expect(getTmdbSize(185, false)).toBe("w185");
    expect(getTmdbSize(220, false)).toBe("w342");
    expect(getTmdbSize(342, false)).toBe("w342");
    expect(getTmdbSize(450, false)).toBe("w500");
    expect(getTmdbSize(500, false)).toBe("w500");
    expect(getTmdbSize(640, false)).toBe("w780");
    expect(getTmdbSize(780, false)).toBe("w780");
    expect(getTmdbSize(1080, false)).toBe("original");
  });

  it("maps backdrop widths to TMDB native backdrop sizes", () => {
    expect(getTmdbSize(250, true)).toBe("w300");
    expect(getTmdbSize(300, true)).toBe("w300");
    expect(getTmdbSize(640, true)).toBe("w780");
    expect(getTmdbSize(780, true)).toBe("w780");
    expect(getTmdbSize(1080, true)).toBe("w1280");
    expect(getTmdbSize(1280, true)).toBe("w1280");
    expect(getTmdbSize(1920, true)).toBe("original");
  });
});

describe("imageLoader", () => {
  it("returns empty string when src is empty", () => {
    expect(imageLoader({ src: "", width: 200 })).toBe("");
  });

  it("rewrites TMDB poster URLs to optimal native size", () => {
    const original = "https://image.tmdb.org/t/p/w780/ncEsesgOJDNrTUED89hYbA117wo.jpg";
    expect(imageLoader({ src: original, width: 220 })).toBe(
      "https://image.tmdb.org/t/p/w342/ncEsesgOJDNrTUED89hYbA117wo.jpg"
    );
    expect(imageLoader({ src: original, width: 180 })).toBe(
      "https://image.tmdb.org/t/p/w185/ncEsesgOJDNrTUED89hYbA117wo.jpg"
    );
  });

  it("rewrites TMDB backdrop URLs preserving backdrop size tiers", () => {
    const backdrop = "https://image.tmdb.org/t/p/w1280/backdrop123.jpg";
    expect(imageLoader({ src: backdrop, width: 640 })).toBe(
      "https://image.tmdb.org/t/p/w780/backdrop123.jpg"
    );
    expect(imageLoader({ src: backdrop, width: 1080 })).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop123.jpg"
    );
    expect(imageLoader({ src: backdrop, width: 1920 })).toBe(
      "https://image.tmdb.org/t/p/original/backdrop123.jpg"
    );
  });

  it("rewrites TMDB episode still URLs appropriately", () => {
    const still = "https://image.tmdb.org/t/p/w300/mock-still-s1e1.jpg";
    expect(imageLoader({ src: still, width: 240 })).toBe(
      "https://image.tmdb.org/t/p/w300/mock-still-s1e1.jpg"
    );
  });

  it("leaves Amazon CloudFront / IMDb poster URLs intact", () => {
    const amazon = "https://m.media-amazon.com/images/M/MV5BMjExMzQ.jpg";
    expect(imageLoader({ src: amazon, width: 300 })).toBe(amazon);
  });

  it("leaves Vercel Blob URLs intact", () => {
    const blob = "https://abc123xyz.public.blob.vercel-storage.com/posters/custom.webp";
    expect(imageLoader({ src: blob, width: 300 })).toBe(blob);
  });

  it("leaves local static URLs intact", () => {
    const local = "/brand/gayflix-logo-tagline.png";
    expect(imageLoader({ src: local, width: 500 })).toBe(local);
  });
});
