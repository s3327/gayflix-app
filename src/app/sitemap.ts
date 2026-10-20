import type { MetadataRoute } from "next";
import { countryHref, genreHref, languageHref, personHref } from "@/lib/browse-href";
import {
  listFilterValues,
  listPublishedEpisodes,
  listPublishedPeople,
  listPublishedTitles,
} from "@/lib/catalog";
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
  "/about",
  "/contact",
  "/copyright",
  "/terms",
  "/privacy",
];

/**
 * Lists every public page, every published title and its episodes
 * (drafts never appear), Browse for each genre, country and language a
 * published title has, and a page for everyone named on one. Built per request from the catalog,
 * so it's never stale.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [titles, episodes, genres, countries, languages, people] = await Promise.all([
    listPublishedTitles(),
    listPublishedEpisodes(),
    listFilterValues("genre"),
    listFilterValues("country"),
    listFilterValues("language"),
    listPublishedPeople(),
  ]);
  const facetPaths = [
    ...genres.map(genreHref),
    ...countries.map(countryHref),
    ...languages.map(languageHref),
    ...people.map(personHref),
  ];

  return [
    ...[...STATIC_PATHS, ...facetPaths].map((path) => ({ url: new URL(path, base).href })),
    ...titles.map((title) => ({
      url: new URL(titleHref(title), base).href,
      lastModified: title.updatedAt,
    })),
    ...episodes.map((episode) => ({
      url: new URL(`/episode/${episode.id}`, base).href,
      lastModified: episode.updatedAt,
    })),
  ];
}
