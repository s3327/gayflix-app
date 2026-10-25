import { browseHref } from "@/lib/browse";

/*
 * Links into the public listings: /browse?genre=Drama,
 * /people/Jordan%20Lee, /search?q=Coming+of+Age. A title's page links
 * its genres, country and language to Browse, its people to their own
 * pages, and its tags to a search for them.
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

/** Names longer than this aren't anyone's (the title form allows 80 per cast name, 120 per credit). */
const MAX_PERSON_NAME = 120;

/**
 * A person's page: their name as it's written in the catalog, in the
 * address (/people/Jos%C3%A9%20Garc%C3%ADa), so accents and hyphens
 * stay exact.
 */
export function personHref(name: string): string {
  return `/people/${encodeURIComponent(name)}`;
}

/**
 * The name in a person page's address, or null when it isn't one. A
 * segment that can't be decoded is taken as already decoded ("100% Real").
 */
export function personName(segment: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(segment);
  } catch {
    name = segment;
  }
  name = name.trim();
  return name && name.length <= MAX_PERSON_NAME ? name : null;
}
