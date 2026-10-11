import type { MetadataRoute } from "next";
import { listPublishedTitles } from "@/lib/catalog";
import { siteUrl } from "@/lib/site-url";
import { titleHref } from "@/lib/title-href";

// Public browse pages. Account, auth, list, search and admin pages are
// left out on purpose; robots.ts disallows most of them. So is "/", which
// redirects to /home.
const STATIC_PATHS = [
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
 * appear). Built per request from the catalog, so it's never stale.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const titles = await listPublishedTitles();

  return [
    ...STATIC_PATHS.map((path) => ({ url: new URL(path, base).href })),
    ...titles.map((title) => ({
      url: new URL(titleHref(title), base).href,
      lastModified: title.updatedAt,
    })),
  ];
}
