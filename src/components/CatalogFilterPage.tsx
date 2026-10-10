import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { FilterChipLink } from "@/components/FilterChip";
import { paginate } from "@/lib/paginate";
import type { Media } from "@/lib/media";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";

type CatalogFilterPageProps = {
  /** Page heading — "Genre", "Country", "Year", "Language". */
  title: string;
  /** Query-string key AND the searchParams key read from — same value
   *  on both ends for all four current callers ("genre", "country",
   *  "year", "language"). */
  paramName: string;
  /** Route this page lives at — "/genre", "/country", etc. */
  basePath: string;
  items: Media[];
  /** Which field on Media this page filters/chips by. */
  getFieldValue: (item: Media) => string;
  /** "alpha" for genre/country/language; "numeric-desc" for year
   *  (newest release year first, rather than alphabetical). */
  chipSort?: "alpha" | "numeric-desc";
  emptyMessage: string;
  searchParams: SearchParams;
};

/**
 * Genre, Country, Year, and Language are the same page with a different
 * field: "All" chip + one chip per distinct value in the catalog,
 * filter, sort newest-first, paginate. This is that page, parameterized
 * — each of the four route files is now just this component with its
 * field plugged in, rather than four ~110-line near-copies.
 *
 * Browse and Trending are deliberately NOT folded in here even though
 * they're also chip + sort + paginate: their chips toggle a type
 * (movie/series, no separate "All" pill) and their sort is a direction
 * toggle rather than always-newest-first, which would turn this
 * component into a pile of special cases instead of simplifying
 * anything. They share the pagination math via paginate() instead.
 */
export default function CatalogFilterPage({
  title,
  paramName,
  basePath,
  items,
  getFieldValue,
  chipSort = "alpha",
  emptyMessage,
  searchParams,
}: CatalogFilterPageProps) {
  const values = Array.from(new Set(items.map(getFieldValue)));
  const sortedValues =
    chipSort === "numeric-desc"
      ? values.sort((a, b) => Number(b) - Number(a))
      : values.sort();

  const rawSelected = firstParam(searchParams[paramName]);
  const selected =
    rawSelected && sortedValues.includes(rawSelected) ? rawSelected : null;

  const filtered = selected
    ? items.filter((item) => getFieldValue(item) === selected)
    : items;

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );

  const requestedPage = pageParam(searchParams.page);
  const { page, totalPages, pageItems } = paginate(sorted, requestedPage);

  function buildHref(value: string | null, targetPage: number) {
    const qs = new URLSearchParams();
    if (value) qs.set(paramName, value);
    if (targetPage !== 1) qs.set("page", String(targetPage));
    const query = qs.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">{title}</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChipLink href={buildHref(null, 1)} isActive={!selected}>
          All
        </FilterChipLink>
        {sortedValues.map((value) => (
          <FilterChipLink
            key={value}
            href={buildHref(value, 1)}
            isActive={selected === value}
          >
            {value}
          </FilterChipLink>
        ))}
      </div>

      {pageItems.length > 0 ? (
        <div className="mt-8">
          <MediaGrid>
            {pageItems.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </MediaGrid>
        </div>
      ) : (
        <p className="mt-8 text-sm text-ink-muted">{emptyMessage}</p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => buildHref(selected, p)}
      />
    </main>
  );
}
