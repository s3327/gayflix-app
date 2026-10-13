import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Plus, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import Pagination from "@/components/Pagination";
import { listEpisodes, listSeriesChoices, type EpisodeSort } from "@/lib/catalog";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Episodes",
};

/**
 * Every episode, or one series' (?series=<id>), by series then season
 * and episode. Episodes of series in the trash aren't listed.
 */
export default async function LibraryEpisodesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const series = await listSeriesChoices();
  const requested = firstParam(params.series);
  const query = firstParam(params.q) ?? "";
  const rawSort = firstParam(params.sort);
  const sort: EpisodeSort =
    rawSort === "title" || rawSort === "season" || rawSort === "episode" || rawSort === "airDate"
      ? rawSort
      : "series";
  const order = (firstParam(params.order) as "asc" | "desc") ?? "asc";
  const seriesId = requested && requested !== "" ? requested : undefined;

  const { items, page, totalPages, total } = await listEpisodes({
    seriesId,
    query,
    sort,
    order,
    page: pageParam(params.page),
  });

  function pageHref(target: number) {
    const qs = new URLSearchParams();
    if (seriesId) qs.set("series", seriesId);
    if (query) qs.set("q", query);
    if (sort && sort !== "series") qs.set("sort", sort);
    if (order && order !== "asc") qs.set("order", order);
    if (target !== 1) qs.set("page", String(target));
    const search = qs.toString();
    return search ? `/admin/library/episodes?${search}` : "/admin/library/episodes";
  }

  function makeSortHref(col: string) {
    const qs = new URLSearchParams();
    if (seriesId) qs.set("series", seriesId);
    if (query) qs.set("q", query);
    if (sort === col) {
      qs.set("order", order === "asc" ? "desc" : "asc");
    } else {
      qs.set("sort", col);
      qs.set("order", "asc");
    }
    const search = qs.toString();
    return search ? `/admin/library/episodes?${search}` : "/admin/library/episodes";
  }

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-10 sm:px-10">
        <div>
          <h1 className="font-display text-2xl font-bold">Library — Episodes</h1>
          <p className="mt-1 text-sm text-ink-muted">Manage television and series episodes across the library.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/export?type=episodes${seriesId ? `&seriesId=${seriesId}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            download
            className="flex items-center gap-1.5 rounded-card border border-border-subtle bg-bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary hover:border-border-strong hover:text-ink-primary shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-brand-pink" />
            Export CSV
          </a>
          {series.length > 0 && (
            <Link
              href={seriesId ? `/admin/upload/episodes?series=${seriesId}` : "/admin/upload/episodes"}
              className="flex items-center gap-2 rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark shadow-2xs"
            >
              <Plus className="h-4 w-4" />
              Add an episode
            </Link>
          )}
        </div>
      </div>

      <form
        action="/admin/library/episodes"
        method="GET"
        className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-10"
      >
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <select
            name="series"
            defaultValue={seriesId ?? ""}
            aria-label="Series"
            className="w-full appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
          >
            <option value="">All series</option>
            {series.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by title"
            aria-label="Search by title"
            className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
          />
        </div>

        <button
          type="submit"
          className="shrink-0 rounded-card border border-border-strong px-5 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          Search
        </button>
      </form>

      {items.length > 0 ? (
        <>
          <p className="mx-6 mb-3 text-sm text-ink-muted sm:mx-10">
            {total === 1 ? "1 episode" : `${total} episodes`}
          </p>
          <div className="mx-6 overflow-x-auto rounded-card border border-border-subtle bg-bg-surface sm:mx-10 shadow-2xs">
            <table className="w-full min-w-[640px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-surface text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="w-56 px-4 py-3 text-left">
                    <Link href={makeSortHref("series")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                      Series
                      <SortIcon col="series" currentSort={sort} currentOrder={order} />
                    </Link>
                  </th>
                  <th className="w-20 px-4 py-3 text-left">
                    <Link href={makeSortHref("season")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                      Season
                      <SortIcon col="season" currentSort={sort} currentOrder={order} />
                    </Link>
                  </th>
                  <th className="w-20 px-4 py-3 text-left">
                    <Link href={makeSortHref("episode")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                      Episode
                      <SortIcon col="episode" currentSort={sort} currentOrder={order} />
                    </Link>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <Link href={makeSortHref("title")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                      Title
                      <SortIcon col="title" currentSort={sort} currentOrder={order} />
                    </Link>
                  </th>
                  <th className="w-24 px-4 py-3 text-left">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((episode) => (
                  <tr key={episode.id} className="transition-colors hover:bg-bg-elevated">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/library/series/${episode.mediaId}`}
                        className="block truncate text-ink-secondary transition-colors hover:text-ink-brand"
                      >
                        {episode.media.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{episode.seasonNumber}</td>
                    <td className="px-4 py-3 text-ink-secondary">{episode.episodeNumber}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/library/episodes/${episode.id}`}
                        className="block truncate font-medium text-ink-primary transition-colors hover:text-ink-brand"
                      >
                        {episode.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{episode.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mx-6 text-sm text-ink-secondary sm:mx-10">
          {query
            ? "No episodes match this search."
            : seriesId
            ? "This series has no episodes yet."
            : "No episodes yet."}
        </p>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} makeHref={pageHref} />}
    </div>
  );
}

function SortIcon({
  col,
  currentSort,
  currentOrder,
}: {
  col: string;
  currentSort: string;
  currentOrder: string;
}) {
  if (currentSort !== col) {
    return <ArrowUpDown className="h-3 w-3 text-ink-muted/50" />;
  }
  return currentOrder === "asc" ? (
    <ArrowUp className="h-3 w-3 text-brand-pink" />
  ) : (
    <ArrowDown className="h-3 w-3 text-brand-pink" />
  );
}
