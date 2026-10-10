import type { MetadataRoute } from "next";
import { listPublicTitles } from "@/lib/find-basic-title";
import { siteUrl } from "@/lib/site-url";
import { titleHref } from "@/lib/title-href";

// Public browse pages. Account, auth, list, search and admin pages are
// left out on purpose; robots.ts disallows most of them.
const STATIC_PATHS = [
  "/",
  "/home",
  "/movie",
  "/series",
  "/trending",
  "/new-releases",
  "/browse",
  "/genre",
  "/country",
  "/year",
  "/language",
  "/terms",
  "/privacy",
];

/**
 * Lists every public page plus every published title (drafts never
 * appear). Built from the mock catalog for now; it follows the real
 * catalog once listPublicTitles() becomes a database query.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  return [
    ...STATIC_PATHS.map((path) => ({ url: new URL(path, base).href })),
    ...listPublicTitles().map((item) => ({
      url: new URL(titleHref(item), base).href,
      lastModified: item.updatedAt ?? item.createdAt,
    })),
  ];
}
