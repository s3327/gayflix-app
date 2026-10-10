import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { FilterChipLink } from "@/components/FilterChip";
import { paginate } from "@/lib/paginate";
import { publishedTrendingItems } from "@/lib/mock-trending";
import { pageParam, type SearchParams } from "@/lib/search-params";

type TypeFilter = "all" | "movie" | "series";

function buildHref(params: { type: TypeFilter; sortDesc: boolean; page: number }) {
  const qs = new URLSearchParams();
  if (params.type !== "all") qs.set("type", params.type);
  if (!params.sortDesc) qs.set("sort", "asc");
  if (params.page !== 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `/trending?${query}` : "/trending";
}

export default async function TrendingPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const typeFilter: TypeFilter =
    searchParams.type === "movie" || searchParams.type === "series"
      ? searchParams.type
      : "all";
  const sortDesc = searchParams.sort !== "asc";

  const filtered =
    typeFilter === "all"
      ? publishedTrendingItems
      : publishedTrendingItems.filter((item) => item.type === typeFilter);

  // Rank badges always show each title's true rank from the full 100 —
  // sorting only changes display order (ascending shows #100 first, not
  // renumbered to #1).
  const sorted = sortDesc ? filtered : [...filtered].reverse();

  const requestedPage = pageParam(searchParams.page);
  const { page, totalPages, pageItems } = paginate(sorted, requestedPage);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold">Trending</h1>
        {/* Placeholder time-range label — "This Week" is hardcoded for
            now. The real toggle (This Week / This Month) will live in
            Admin → Setting → Site, not built yet — see SettingsTabs.tsx. */}
        <span className="rounded-pill bg-bg-elevated px-3 py-1 text-xs font-semibold text-ink-secondary">
          This Week
        </span>
      </div>

      {/* Filter chips (left) + sort toggle (right) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["movie", "series"] as const).map((type) => {
            const isActive = typeFilter === type;
            return (
              <FilterChipLink
                key={type}
                href={buildHref({ type: isActive ? "all" : type, sortDesc, page: 1 })}
                isActive={isActive}
              >
                {type}
              </FilterChipLink>
            );
          })}
        </div>

        <Link
          href={buildHref({ type: typeFilter, sortDesc: !sortDesc, page: 1 })}
          className="flex items-center gap-1.5 rounded-card border border-border-strong px-4 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          {sortDesc ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
          Views: {sortDesc ? "High to Low" : "Low to High"}
        </Link>
      </div>

      <div className="mt-6">
        <MediaGrid>
          {pageItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              badge={
                <span className="flex h-8 min-w-8 items-center justify-center rounded-md bg-bg-base/85 px-2 font-display text-sm font-bold text-ink-brand backdrop-blur-sm">
                  #{item.rank}
                </span>
              }
            />
          ))}
        </MediaGrid>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => buildHref({ type: typeFilter, sortDesc, page: p })}
      />
    </main>
  );
}
