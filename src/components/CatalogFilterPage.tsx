import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { FilterChipLink } from "@/components/FilterChip";
import {
  listFilterValues,
  listTitles,
  type FilterField,
  type TitleFilter,
} from "@/lib/catalog";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";

type CatalogFilterPageProps = {
  /** Page heading — "Genre", "Country", "Year", "Language". */
  title: string;
  /** What the chips filter by. Also the query-string key: /genre?genre=Drama. */
  field: FilterField;
  /** Route this page lives at — "/genre", "/country", etc. */
  basePath: string;
  emptyMessage: string;
  searchParams: SearchParams;
};

function filterFor(field: FilterField, value: string): TitleFilter {
  switch (field) {
    case "genre":
      return { genre: value };
    case "country":
      return { country: value };
    case "language":
      return { language: value };
    case "year":
      return { year: Number(value) };
  }
}

/**
 * Genre, Country, Year, and Language are the same page with a different
 * field: "All" chip + one chip per value published titles have, filter,
 * sort newest-first, paginate. This is that page, parameterized — each
 * of the four route files is just this component with its field plugged
 * in, rather than four ~110-line near-copies.
 *
 * Browse and Trending are deliberately NOT folded in here even though
 * they're also chip + sort + paginate: their chips toggle a type
 * (movie/series, no separate "All" pill) and their sort is a direction
 * toggle rather than always-newest-first, which would turn this
 * component into a pile of special cases instead of simplifying
 * anything.
 */
export default async function CatalogFilterPage({
  title,
  field,
  basePath,
  emptyMessage,
  searchParams,
}: CatalogFilterPageProps) {
  const values = await listFilterValues(field);

  // Anything that isn't one of the chips shows everything.
  const rawSelected = firstParam(searchParams[field]);
  const selected = rawSelected && values.includes(rawSelected) ? rawSelected : null;

  const { items: pageItems, page, totalPages } = await listTitles({
    sort: "added",
    page: pageParam(searchParams.page),
    ...(selected ? filterFor(field, selected) : {}),
  });

  function buildHref(value: string | null, targetPage: number) {
    const qs = new URLSearchParams();
    if (value) qs.set(field, value);
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
        {values.map((value) => (
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
