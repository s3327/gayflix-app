"use client";

import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";

type SearchBy = "title" | "imdb";

const SELECT =
  "appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden";

/**
 * Search bar for the Import page: a plain GET form, so a search lives in
 * the URL (?q=…&by=…&type=…) and its pages can be linked to. Native
 * <select> elements with a chevron overlay, like the library's.
 *
 * "Search by" picks how the text is read: Title searches TMDB for movies
 * or series (the Media type); IMDb ID looks one title up, of either
 * type. The only state here is the placeholder that follows it.
 */
export default function ImportSearchBar({
  query,
  by,
  type,
}: {
  query: string;
  by: SearchBy;
  type: "movie" | "series";
}) {
  const [searchBy, setSearchBy] = useState<SearchBy>(by);
  const placeholder = searchBy === "title" ? "Search by title" : "IMDb ID, such as tt0133093";

  return (
    <form action="/admin/import" method="GET" className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-10">
      {/* Text field — takes all remaining space */}
      <input
        type="search"
        name="q"
        defaultValue={query}
        required
        maxLength={200}
        placeholder={placeholder}
        aria-label={searchBy === "title" ? "Title" : "IMDb ID"}
        className="min-w-[200px] flex-1 rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
      />

      <div className="relative shrink-0">
        <select
          name="by"
          value={searchBy}
          onChange={(e) => setSearchBy(e.target.value as SearchBy)}
          aria-label="Search by"
          className={SELECT}
        >
          <option value="title">Title</option>
          <option value="imdb">IMDb ID</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      </div>

      {/* An IMDb ID finds its title whatever the type. */}
      {searchBy === "title" && (
        <div className="relative shrink-0">
          <select name="type" defaultValue={type} aria-label="Media type" className={SELECT}>
            <option value="movie">Movie</option>
            <option value="series">Series</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>
      )}

      <button
        type="submit"
        className="flex shrink-0 items-center gap-2 rounded-card bg-brand-pink px-6 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
      >
        <Search className="h-4 w-4" />
        Search
      </button>
    </form>
  );
}
