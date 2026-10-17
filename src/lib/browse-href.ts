import { browseHref } from "@/lib/browse";

/*
 * Links into the public listings: /browse?genre=Drama,
 * /search?q=Jordan+Lee. A title's page links its genres, country and
 * language to Browse, and its people and tags to a search for them.
 */

export function genreHref(genre: string): string {
  return browseHref({ genre });
}

export function countryHref(country: string): string {
  return browseHref({ country });
}

export function languageHref(language: string): string {
  return browseHref({ language });
}

/** The search page for `query`; page 1 unless given. */
export function searchHref(query: string, page = 1): string {
  const qs = new URLSearchParams({ q: query });
  if (page !== 1) qs.set("page", String(page));
  return `/search?${qs}`;
}
