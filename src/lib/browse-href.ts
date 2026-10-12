/*
 * Links into the public listings, built the same way the listings build
 * their own: /genre?genre=Drama, /search?q=Jordan+Lee. A title's page
 * links its genres, country and language to their listings, and its
 * people and tags to a search for them.
 */

export function genreHref(genre: string): string {
  return `/genre?${new URLSearchParams({ genre })}`;
}

export function countryHref(country: string): string {
  return `/country?${new URLSearchParams({ country })}`;
}

export function languageHref(language: string): string {
  return `/language?${new URLSearchParams({ language })}`;
}

/** The search page for `query`; page 1 unless given. */
export function searchHref(query: string, page = 1): string {
  const qs = new URLSearchParams({ q: query });
  if (page !== 1) qs.set("page", String(page));
  return `/search?${qs}`;
}
