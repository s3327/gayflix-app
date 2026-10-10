import Link from "next/link";
import { ArrowDownAZ, ArrowDown, ArrowUp } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { FilterChipLink } from "@/components/FilterChip";
import { listTitles } from "@/lib/catalog";
import { pageParam, type SearchParams } from "@/lib/search-params";

type TypeFilter = "all" | "movie" | "series";

function buildHref(params: { type: TypeFilter; sortAsc: boolean; page: number }) {
  const qs = new URLSearchParams();
  if (params.type !== "all") qs.set("type", params.type);
  if (!params.sortAsc) qs.set("sort", "desc");
  if (params.page !== 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `/browse?${query}` : "/browse";
}

export default async function BrowsePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  // The whole published catalog, not scoped to any one genre/country/
  // year/language the way those pages are.
  const typeFilter: TypeFilter =
    searchParams.type === "movie" || searchParams.type === "series"
      ? searchParams.type
      : "all";
  const sortAsc = searchParams.sort !== "desc";

  const { items: pageItems, page, totalPages } = await listTitles({
    type: typeFilter === "all" ? undefined : typeFilter,
    sort: sortAsc ? "title" : "title-desc",
    page: pageParam(searchParams.page),
  });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">Browse</h1>

      {/* Type filter chips (left) + alphabetical sort (right) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["movie", "series"] as const).map((type) => {
            const isActive = typeFilter === type;
            return (
              <FilterChipLink
                key={type}
                href={buildHref({ type: isActive ? "all" : type, sortAsc, page: 1 })}
                isActive={isActive}
              >
                {type}
              </FilterChipLink>
            );
          })}
        </div>

        {/* Sort control: an A–Z icon labels this as the alphabetical
            sort (the only sort mode this page has), and the separate
            asc/desc icon button next to it is what's actually
            clickable — it just flips the direction. */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-card border border-border-strong px-4 py-1.5 text-xs font-semibold text-ink-secondary">
            <ArrowDownAZ className="h-3.5 w-3.5" />
            Title
          </span>
          <Link
            href={buildHref({ type: typeFilter, sortAsc: !sortAsc, page: 1 })}
            aria-label={sortAsc ? "Sort Z to A" : "Sort A to Z"}
            title={sortAsc ? "A to Z" : "Z to A"}
            className="flex items-center justify-center rounded-card border border-border-strong p-2 text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
          >
            {sortAsc ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </Link>
        </div>
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
        <p className="mt-8 text-sm text-ink-muted">No titles found.</p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => buildHref({ type: typeFilter, sortAsc, page: p })}
      />
    </main>
  );
}
