import ImportButton, { ImportedLink } from "@/components/admin/ImportButton";
import ImportSearchBar from "@/components/admin/ImportSearchBar";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import Pagination from "@/components/Pagination";
import { importTitle } from "@/lib/admin-import-actions";
import { imageHosts } from "@/lib/image-hosts.mjs";
import { omdbConfigured } from "@/lib/omdb";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";
import { tmdbConfigured } from "@/lib/tmdb";
import { gradientFor, imageUrlProblem, NO_POSTER } from "@/lib/title-form";
import { searchSources, type ImportCard, type ImportSearch } from "@/lib/title-import";

/**
 * /admin/import: finds titles on TMDB, by title or IMDb ID, 40 to a page.
 * Importing one checks it against IMDb (through OMDb) and adds it as a
 * draft (src/lib/admin-import-actions.ts). Titles already imported link
 * to their edit page instead.
 */
export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const search: ImportSearch = {
    query: (firstParam(params.q) ?? "").trim().slice(0, 200),
    by: firstParam(params.by) === "imdb" ? "imdb" : "title",
    type: firstParam(params.type) === "series" ? "series" : "movie",
    page: pageParam(params.page),
  };

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Import</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Find a movie or series on TMDB and import it as a draft. Each import is checked against
          IMDb first.
          {tmdbConfigured() && !omdbConfigured() && " IMDb checks are off until OMDB_API_KEY is set."}
        </p>
      </div>

      <ImportSearchBar query={search.query} by={search.by} type={search.type} />

      {!tmdbConfigured() ? (
        <p className="mx-6 max-w-2xl text-sm text-ink-secondary sm:mx-10">
          Searching needs a TMDB key. Add TMDB_API_KEY to the site&apos;s environment variables and
          redeploy (see &ldquo;Importing titles&rdquo; in docs/DEPLOYMENT.md).
        </p>
      ) : (
        search.query && <Results search={search} />
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
      <p className="mb-4 text-sm text-ink-muted">
        {result.total === 1 ? "1 result" : `${result.total.toLocaleString("en-US")} results`} on TMDB
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
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
  // No poster on TMDB: the "No poster yet" image, as the title gets it
  // unless IMDb has one. A host next/image refuses: the gradient.
  const posterUrl = !card.posterUrl
    ? NO_POSTER
    : imageUrlProblem(card.posterUrl, hosts)
      ? undefined
      : card.posterUrl;
  return (
    <div className="flex h-full flex-col gap-2">
      <MediaCoverThumb
        entry={{ title: card.title, posterUrl, gradient: gradientFor(card.tmdbId) }}
        sizes="(min-width: 1536px) 10vw, (min-width: 1280px) 12vw, (min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw"
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-ink-primary">{card.title}</p>
        <p className="text-xs text-ink-muted">
          {card.type === "movie" ? "Movie" : "Series"}
          {card.year !== null && ` · ${card.year}`}
        </p>
      </div>
      {card.imported ? (
        <ImportedLink title={card.title} imported={card.imported} />
      ) : (
        <ImportButton action={importTitle.bind(null, card.tmdbId)} title={card.title} />
      )}
    </div>
  );
}
