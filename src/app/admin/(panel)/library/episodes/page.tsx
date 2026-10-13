import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import Pagination from "@/components/Pagination";
import { listEpisodes, listSeriesChoices } from "@/lib/catalog";
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
  const seriesId = series.some((choice) => choice.id === requested) ? requested : undefined;
  const { items, page, totalPages, total } = await listEpisodes({
    seriesId,
    page: pageParam(params.page),
  });

  function pageHref(target: number) {
    const qs = new URLSearchParams();
    if (seriesId) qs.set("series", seriesId);
    if (target !== 1) qs.set("page", String(target));
    const search = qs.toString();
    return search ? `/admin/library/episodes?${search}` : "/admin/library/episodes";
  }

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Library — Episodes</h1>
        {series.length > 0 && (
          <Link
            href={seriesId ? `/admin/upload/episodes?series=${seriesId}` : "/admin/upload/episodes"}
            className="flex items-center gap-2 rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            <Plus className="h-4 w-4" />
            Add an episode
          </Link>
        )}
      </div>

      <form
        action="/admin/library/episodes"
        method="GET"
        className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-10"
      >
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
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
        <button
          type="submit"
          className="shrink-0 rounded-card border border-border-strong px-5 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          Show
        </button>
      </form>

      {items.length > 0 ? (
        <>
          <p className="mx-6 mb-3 text-sm text-ink-muted sm:mx-10">
            {total === 1 ? "1 episode" : `${total} episodes`}
          </p>
          <div className="mx-6 overflow-x-auto rounded-card border border-border-subtle sm:mx-10">
            <table className="w-full min-w-[640px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-surface text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="w-56 px-4 py-3 text-left">Series</th>
                  <th className="w-20 px-4 py-3 text-left">Season</th>
                  <th className="w-20 px-4 py-3 text-left">Episode</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="w-24 px-4 py-3 text-left">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-bg-surface">
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
          {seriesId ? "This series has no episodes yet." : "No episodes yet."}
        </p>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} makeHref={pageHref} />}
    </div>
  );
}
