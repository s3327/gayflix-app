"use client";

/**
 * Custom Next.js image loader that bypasses Vercel's serverless image optimization
 * pipeline (/_next/image), slashing transformations and function CPU usage.
 *
 * For TMDB images (which account for >95% of catalog artwork), TMDB's native global
 * Cloudflare CDN provides pre-scaled, edge-cached widths:
 * - Posters: w92, w154, w185, w342, w500, w780, original
 * - Backdrops & Stills: w300, w780, w1280, original
 *
 * For all other images (Amazon CloudFront / Vercel Blob / Picsum / local static assets),
 * the source URL is served directly without redundant re-encoding.
 */

export function getTmdbSize(width: number, isBackdrop = false): string {
  if (isBackdrop) {
    if (width <= 300) return "w300";
    if (width <= 780) return "w780";
    if (width <= 1280) return "w1280";
    return "original";
  }

  if (width <= 92) return "w92";
  if (width <= 154) return "w154";
  if (width <= 185) return "w185";
  if (width <= 342) return "w342";
  if (width <= 500) return "w500";
  if (width <= 780) return "w780";
  return "original";
}

export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src) return "";

  if (src.includes("image.tmdb.org/t/p/")) {
    const isBackdrop = src.includes("/w1280/") || src.includes("/w300/");
    const targetSize = getTmdbSize(width, isBackdrop);
    return src.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${targetSize}/`);
  }

  return src;
}
