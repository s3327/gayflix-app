import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { searchHref } from "@/lib/browse-href";
import { searchTitles } from "@/lib/catalog";
import { normalizeQuery } from "@/lib/search";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";

const QUICK_SEARCHES = ["Drama", "Romance", "Comedy", "2026", "Documentary", "Coming of Age"];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const query = normalizeQuery(firstParam((await searchParams).q) ?? "");
  return {
    title: query ? `Results for “${query}”` : "Search",
    // Result pages for every possible query aren't worth indexing, but
    // the titles they link to are.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const query = normalizeQuery(firstParam(searchParams.q) ?? "");
  // Published titles whose title, synopsis, people, tags, genres,
  // country or language contain the query, or from that year; title
  // matches first.
  const requestedPage = pageParam(searchParams.page);
  const { items: results, total, page, totalPages } = await searchTitles(query, requestedPage);
  // An address past the last page isn't a page.
  if (page !== requestedPage) notFound();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Search Gayflix</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Find movies and series by title, genre, cast, director, or release year.
        </p>

        {/* On screen the heading and the Search button say what the field
            is for; its label is for screen readers. */}
        <form
          role="search"
          action="/search"
          method="GET"
          className="mt-6 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <label htmlFor="search-page-q" className="sr-only">
              Search titles
            </label>
            <Search
              aria-hidden
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="search-page-q"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search by title, cast, genre, year..."
              className="w-full rounded-card border border-border-subtle bg-bg-surface py-3.5 pl-12 pr-4 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="rounded-card bg-brand-pink px-6 py-3.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            Search
          </button>
        </form>

        {/* Quick searches */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-ink-muted">Popular:</span>
          {QUICK_SEARCHES.map((term) => (
            <Link
              key={term}
              href={searchHref(term)}
              className="rounded-pill border border-border-subtle bg-bg-surface px-3 py-1 font-medium text-ink-secondary transition-colors hover:border-brand-pink hover:text-ink-brand"
            >
              {term}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-12">
        {query ? (
          <div>
            <div className="mb-6 flex items-baseline justify-between border-b border-border-subtle pb-4">
              <h2 className="font-display text-xl font-bold">
                Results for &ldquo;{query}&rdquo;
              </h2>
              <span className="text-xs font-semibold text-ink-muted">
                {total} {total === 1 ? "title" : "titles"} found
              </span>
            </div>

            {results.length > 0 ? (
              <>
                <MediaGrid>
                  {results.map((item) => (
                    <MediaCard key={item.id} item={item} />
                  ))}
                </MediaGrid>
                {totalPages > 1 && (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    makeHref={(p) => searchHref(query, p)}
                  />
                )}
              </>
            ) : (
              <div className="py-16 text-center">
                <p className="text-base font-semibold text-ink-primary">
                  No titles found matching &ldquo;{query}&rdquo;
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  Try checking your spelling or search for another genre, title, or release year.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-ink-muted">
            Enter a keyword above or explore one of the popular categories to get started.
          </div>
        )}
      </div>
    </main>
  );
}
