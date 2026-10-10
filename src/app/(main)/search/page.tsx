import Link from "next/link";
import { Search } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import { publishedMediaItems } from "@/lib/mock-media";
import { movies, series, newReleases, trendingNow } from "@/lib/mock-titles";
import type { Media } from "@/lib/media";
import { firstParam, type SearchParams } from "@/lib/search-params";

const QUICK_SEARCHES = ["Drama", "Romance", "Comedy", "2026", "Documentary", "Coming of Age"];

function getAllSearchableItems(): Media[] {
  const seen = new Set<string>();
  const all: Media[] = [];

  for (const item of [...movies, ...series, ...newReleases, ...trendingNow, ...publishedMediaItems]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      all.push(item);
    }
  }

  return all;
}

export default async function SearchPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const query = (firstParam(searchParams.q) ?? "").trim();
  const qLower = query.toLowerCase();

  const allItems = getAllSearchableItems();
  const results = query
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(qLower) ||
          item.genre.toLowerCase().includes(qLower) ||
          (item.synopsis && item.synopsis.toLowerCase().includes(qLower)) ||
          (item.country && item.country.toLowerCase().includes(qLower)) ||
          String(item.year).includes(qLower)
      )
    : [];

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Search Gayflix</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Find movies, series, genres, or release years across our collection.
        </p>

        {/* Search input form on the page */}
        <form action="/search" method="GET" className="mt-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search by title, genre, year..."
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
              href={`/search?q=${encodeURIComponent(term)}`}
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
                {results.length} {results.length === 1 ? "title" : "titles"} found
              </span>
            </div>

            {results.length > 0 ? (
              <MediaGrid>
                {results.map((item) => (
                  <MediaCard key={item.id} item={item} />
                ))}
              </MediaGrid>
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
