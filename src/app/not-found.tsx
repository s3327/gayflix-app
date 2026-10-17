import Link from "next/link";
import { Search } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import { listTitles } from "@/lib/catalog";
import type { Media } from "@/lib/media";

const POPULAR_COUNT = 6;

/** The most watched titles, or none if the catalog can't be read. */
async function popularTitles(): Promise<Media[]> {
  try {
    const { items } = await listTitles({ sort: "popular", page: 1 });
    return items.slice(0, POPULAR_COUNT);
  } catch {
    return [];
  }
}

/**
 * The branded 404: a way to search for what was meant, Back to Home, and
 * the most popular titles to carry on from.
 */
export default async function NotFound() {
  const popular = await popularTitles();

  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col items-center justify-center px-4 py-16 text-center sm:px-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-ink-brand">404</p>
      <h1 className="mt-3 font-display text-4xl font-bold">Page not found</h1>
      <p className="mt-3 max-w-xl text-ink-secondary">
        We couldn&apos;t find what you were looking for. It may have moved, or
        the link may be wrong.
      </p>

      <form
        action="/search"
        role="search"
        className="mt-8 flex w-full max-w-md items-center gap-2"
      >
        <label htmlFor="not-found-search" className="sr-only">
          Search titles
        </label>
        <input
          id="not-found-search"
          type="search"
          name="q"
          placeholder="Search for a title"
          className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated"
        >
          <Search className="h-4 w-4" aria-hidden />
          Search
        </button>
      </form>

      <Link
        href="/home"
        className="mt-6 rounded-card bg-brand-pink px-7 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
      >
        Back to Home
      </Link>

      {popular.length > 0 && (
        <section aria-labelledby="popular-heading" className="mt-14 w-full text-left">
          <h2 id="popular-heading" className="font-display text-xl font-bold">
            Popular on Gayflix
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
            {popular.map((item) => (
              <MediaCard key={item.id} item={item} actions={false} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
