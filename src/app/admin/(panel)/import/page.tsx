import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Sparkles, Film, Search, Upload } from "lucide-react";
import ImportButton, { ImportedLink } from "@/components/admin/ImportButton";
import ImportSearchBar from "@/components/admin/ImportSearchBar";
import BatchImportBar from "@/components/admin/BatchImportBar";
import ImdbBatchImporter from "@/components/admin/import/ImdbBatchImporter";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import Pagination from "@/components/Pagination";
import { importTitle } from "@/lib/admin-import-actions";
import { imageHosts } from "@/lib/image-hosts.mjs";
import { omdbConfigured } from "@/lib/omdb";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";
import { tmdbConfigured } from "@/lib/tmdb";
import { gradientFor, imageUrlProblem, NO_POSTER, libraryPath } from "@/lib/title-form";
import { searchSources, type ImportCard, type ImportSearch } from "@/lib/title-import";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Import",
};

/**
 * /admin/import: finds titles on TMDB, by title or IMDb ID, 40 to a page,
 * or imports IMDb export CSV files in chunked batches as drafts.
 */
export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const tab = firstParam(params.tab) === "batch" ? "batch" : "search";

  const search: ImportSearch = {
    query: (firstParam(params.q) ?? "").trim().slice(0, 200),
    by: firstParam(params.by) === "imdb" ? "imdb" : "title",
    type: firstParam(params.type) === "series" ? "series" : "movie",
    page: pageParam(params.page),
  };

  const recentImports = !search.query
    ? await db.media.findMany({
        where: { tmdbId: { not: null }, trashedAt: null },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, title: true, type: true, year: true, posterUrl: true },
      })
    : [];

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Import</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Find titles on TMDB or import an entire IMDb watchlist/ratings export in batch.
          Titles are saved as drafts for editorial review.
          {tmdbConfigured() && !omdbConfigured() && " IMDb checks are off until OMDB_API_KEY is set."}
        </p>

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-border-subtle">
          <Link
            href="/admin/import?tab=search"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
              tab === "search"
                ? "border-brand-pink text-brand-pink"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            <Search className="h-4 w-4" />
            Search TMDB &amp; IMDb
          </Link>
          <Link
            href="/admin/import?tab=batch"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
              tab === "batch"
                ? "border-brand-pink text-brand-pink"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            <Upload className="h-4 w-4" />
            IMDb Batch Import (CSV)
          </Link>
        </div>
      </div>

      {tab === "batch" ? (
        <div className="px-6 py-6 sm:px-10">
          <ImdbBatchImporter />
        </div>
      ) : (
        <>
          <ImportSearchBar query={search.query} by={search.by} type={search.type} />

          {!tmdbConfigured() ? (
            <p className="mx-6 max-w-2xl text-sm text-ink-secondary sm:mx-10">
              Searching needs a TMDB key. Add TMDB_API_KEY to the site&apos;s environment variables and
              redeploy (see &ldquo;Importing titles&rdquo; in docs/DEPLOYMENT.md).
            </p>
          ) : search.query ? (
            <Results search={search} />
          ) : (
            /* Empty State with Tips & Recent Imports */
            <div className="px-6 py-6 sm:px-10 space-y-8">
              <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 max-w-3xl">
                <h2 className="flex items-center gap-2 text-base font-bold text-ink-primary">
                  <Sparkles className="h-4 w-4 text-brand-pink" />
                  Quick Import Tips
                </h2>
                <ul className="mt-3 space-y-2 text-xs text-ink-secondary">
                  <li>• Search by exact title or paste an IMDb ID like <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-ink-primary">tt0133093</code>.</li>
                  <li>• Select multiple search results to import entire franchises or film collections in batch.</li>
                  <li>
                    • Have an IMDb Watchlist or export CSV?{" "}
                    <Link
                      href="/admin/import?tab=batch"
                      className="font-semibold text-brand-pink hover:underline inline-flex items-center gap-1"
                    >
                      Switch to IMDb Batch Import
                      <ExternalLink className="h-3 w-3 inline" />
                    </Link>{" "}
                    to import entire lists as drafts in batch.
                  </li>
                  <li>• Imported titles start as <span className="font-semibold text-ink-primary">Drafts</span> so you can review posters, video sources, and cast before publishing.</li>
                </ul>
              </div>

              {recentImports.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted mb-4">
                    Recently Imported Titles
                  </h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                    {recentImports.map((item) => (
                      <Link
                        key={item.id}
                        href={`${libraryPath(item.type)}/${item.id}`}
                        className="group flex flex-col gap-2 rounded-card border border-border-subtle bg-bg-surface p-2.5 transition-colors hover:border-brand-pink/50 hover:bg-bg-elevated"
                      >
                        <div className="relative aspect-2/3 w-full overflow-hidden rounded bg-bg-base">
                          {item.posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.posterUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-ink-muted">
                              <Film className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink-primary group-hover:text-ink-brand">
                            {item.title}
                          </p>
                          <p className="text-2xs text-ink-muted">{item.year}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <BatchImportBar />
        </>
      )}
    </div>
  );
}

async function Results({ search }: { search: ImportSearch }) {
  const result = await searchSources(search);
  if (!result.ok) {
    return (
      <p role="alert" className="mx-6 text-sm font-medium text-status-error sm:mx-10">
        {result.message}
      </p>
    );
  }
  if (result.cards.length === 0) {
    return (
      <p className="mx-6 text-sm text-ink-secondary sm:mx-10">
        {search.by === "imdb" ? "TMDB has no title with that IMDb ID." : "TMDB has nothing that matches."}
      </p>
    );
  }

  function pageHref(page: number) {
    const qs = new URLSearchParams({ q: search.query, by: search.by, type: search.type });
    if (page !== 1) qs.set("page", String(page));
    return `/admin/import?${qs}`;
  }

  const hosts = imageHosts();
  return (
    <section aria-label="Results" className="px-6 sm:px-10">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {result.total === 1 ? "1 result" : `${result.total.toLocaleString("en-US")} results`} on TMDB
        </p>
        <span className="text-xs text-ink-muted hidden sm:inline">
          Tick checkboxes below to import multiple titles together
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {result.cards.map((card) => (
          <li key={card.tmdbId}>
            <ResultCard card={card} hosts={hosts} />
          </li>
        ))}
      </ul>
      {result.totalPages > 1 && (
        <Pagination page={result.page} totalPages={result.totalPages} makeHref={pageHref} />
      )}
    </section>
  );
}

function ResultCard({ card, hosts }: { card: ImportCard; hosts: string[] }) {
  const posterUrl = !card.posterUrl
    ? NO_POSTER
    : imageUrlProblem(card.posterUrl, hosts)
      ? undefined
      : card.posterUrl;

  const tmdbNumericId = card.tmdbId.split("/")[1];
  const tmdbUrl = `https://www.themoviedb.org/${card.type === "movie" ? "movie" : "tv"}/${tmdbNumericId}`;

  return (
    <div className="relative flex h-full flex-col justify-between rounded-card border border-border-subtle bg-bg-surface p-3 shadow-2xs transition-colors hover:border-border-strong">
      {/* Batch selection checkbox */}
      {!card.imported && (
        <div className="absolute left-4 top-4 z-10">
          <input
            type="checkbox"
            name="tmdbIds"
            value={card.tmdbId}
            aria-label={`Select ${card.title} for batch import`}
            className="h-4 w-4 rounded-sm border-border-strong bg-bg-surface/90 accent-brand-pink shadow-xs cursor-pointer"
          />
        </div>
      )}

      <div>
        <div className="overflow-hidden rounded-md">
          <MediaCoverThumb
            entry={{ title: card.title, posterUrl, gradient: gradientFor(card.tmdbId) }}
            sizes="(min-width: 1536px) 15vw, (min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          />
        </div>

        <div className="mt-2.5 min-w-0">
          <p className="line-clamp-1 text-sm font-bold text-ink-primary" title={card.title}>
            {card.title}
          </p>
          {card.originalTitle && (
            <p className="line-clamp-1 text-2xs italic text-ink-muted">
              {card.originalTitle}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between text-xs text-ink-secondary">
            <span>
              {card.type === "movie" ? "Movie" : "Series"}
              {card.year !== null && ` · ${card.year}`}
            </span>
            <a
              href={tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="View on TMDB"
              className="text-ink-muted hover:text-ink-brand p-0.5"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {card.overview && (
            <p className="mt-1.5 line-clamp-2 text-2xs text-ink-muted">
              {card.overview}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-border-subtle">
        {card.imported ? (
          <ImportedLink title={card.title} imported={card.imported} />
        ) : (
          <ImportButton action={importTitle.bind(null, card.tmdbId)} title={card.title} />
        )}
      </div>
    </div>
  );
}
