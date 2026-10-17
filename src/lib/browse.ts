import type { MediaType } from "@/lib/media";
import { firstParam, type SearchParams } from "@/lib/search-params";

/*
 * The Browse page's address: every filter and the sort live in the query
 * string (/browse?genre=Drama&year=2020s&sort=title), so a filtered
 * page can be shared, bookmarked and gone back to. Pure, so the page and
 * its filter form read and write addresses the same way.
 */

export const BROWSE_SORTS = {
  popular: "Most popular",
  added: "Recently added",
  released: "Newest releases",
  title: "Title A–Z",
} as const;

export type BrowseSort = keyof typeof BROWSE_SORTS;

export const DEFAULT_SORT: BrowseSort = "popular";

/** The choices published titles offer, from the catalog. */
export type BrowseOptions = {
  genres: string[];
  /** Newest first. */
  years: number[];
  countries: string[];
  languages: string[];
};

/** A Browse address, as its query string spells it. Empty means any. */
export type BrowseQuery = {
  type: "" | MediaType;
  genre: string;
  /** "2024" or a decade, "2020s". */
  year: string;
  country: string;
  language: string;
  sort: BrowseSort;
};

export const EMPTY_QUERY: BrowseQuery = {
  type: "",
  genre: "",
  year: "",
  country: "",
  language: "",
  sort: DEFAULT_SORT,
};

/** A value in the address that isn't one of the choices, so it's left out. */
export type IgnoredValue = { facet: "type" | "genre" | "year" | "country" | "language"; value: string };

const TYPE_LABELS: Record<MediaType, string> = { movie: "Movies", series: "Series" };

/** The decades the years fall in, newest first: [2020, 2010]. */
export function decadesOf(years: number[]): number[] {
  return [...new Set(years.map((year) => Math.floor(year / 10) * 10))].sort((a, b) => b - a);
}

/** The years a `year` value covers, or null if it isn't one. */
export function yearRange(value: string): { from: number; to: number } | null {
  const decade = /^(\d{3}0)s$/.exec(value);
  if (decade) {
    const from = Number(decade[1]);
    return { from, to: from + 9 };
  }
  if (/^\d{4}$/.test(value)) return { from: Number(value), to: Number(value) };
  return null;
}

/** The choice `value` names, matched without regard to case. */
function pick(options: string[], value: string): string | undefined {
  const wanted = value.toLowerCase();
  return options.find((option) => option.toLowerCase() === wanted);
}

/**
 * Reads a Browse address. Values that aren't among the choices are left
 * out and listed in `ignored`, so the page can say so instead of quietly
 * showing everything.
 */
export function parseBrowse(
  params: SearchParams,
  options: BrowseOptions
): { query: BrowseQuery; ignored: IgnoredValue[] } {
  const query = { ...EMPTY_QUERY };
  const ignored: IgnoredValue[] = [];
  const read = (key: string) => firstParam(params[key])?.trim() ?? "";

  const type = read("type").toLowerCase();
  if (type === "movie" || type === "series") query.type = type;
  else if (type) ignored.push({ facet: "type", value: read("type") });

  const facets = [
    ["genre", options.genres],
    ["country", options.countries],
    ["language", options.languages],
  ] as const;
  for (const [facet, choices] of facets) {
    const value = read(facet);
    if (!value) continue;
    const match = pick(choices, value);
    if (match) query[facet] = match;
    else ignored.push({ facet, value });
  }

  const year = read("year").toLowerCase();
  if (year) {
    const range = yearRange(year);
    if (range && options.years.some((y) => y >= range.from && y <= range.to)) query.year = year;
    else ignored.push({ facet: "year", value: read("year") });
  }

  const sort = read("sort");
  if (sort in BROWSE_SORTS) query.sort = sort as BrowseSort;

  return { query, ignored };
}

/** The Browse address for `query`, on `page`. */
export function browseHref(query: Partial<BrowseQuery>, page = 1): string {
  const qs = new URLSearchParams();
  for (const key of ["type", "genre", "year", "country", "language"] as const) {
    const value = query[key];
    if (value) qs.set(key, value);
  }
  if (query.sort && query.sort !== DEFAULT_SORT) qs.set("sort", query.sort);
  if (page !== 1) qs.set("page", String(page));
  const search = qs.toString();
  return search ? `/browse?${search}` : "/browse";
}

/** Whether any filter is set (the sort isn't a filter). */
export function hasFilters(query: BrowseQuery): boolean {
  return Boolean(query.type || query.genre || query.year || query.country || query.language);
}

/** What the filters pick, for the heading: "Drama · Movies · 2020s". Empty without filters. */
export function browseLabel(query: BrowseQuery): string {
  return [
    query.genre,
    query.type ? TYPE_LABELS[query.type] : "",
    query.year,
    query.country,
    query.language,
  ]
    .filter(Boolean)
    .join(" · ");
}
