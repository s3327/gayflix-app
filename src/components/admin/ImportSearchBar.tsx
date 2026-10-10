"use client";

import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";

type SearchBy = "title" | "imdb_id";

/**
 * Search bar for the Import page. UI only for now — no submit handler,
 * no result fetching. Native <select> elements are used for the dropdowns
 * (functional, accessible, no extra open/close state to write) with a
 * custom chevron overlay so they match the design system instead of
 * looking like unstyled browser defaults.
 *
 * "Search by" (Title / IMDb ID) is the gate that will determine how the
 * import process interprets the text field later — Title triggers a
 * title search, IMDb ID triggers a direct lookup. For now it just swaps
 * the placeholder text.
 */
export default function ImportSearchBar() {
  const [searchBy, setSearchBy] = useState<SearchBy>("title");
  const placeholder = searchBy === "title" ? "Search by title" : "Search by ID";

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-10">
      {/* Text field — takes all remaining space */}
      <input
        type="text"
        placeholder={placeholder}
        className="min-w-[200px] flex-1 rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
      />

      {/* Search by — gates Title vs. IMDb ID for the import process later */}
      <div className="relative shrink-0">
        <select
          value={searchBy}
          onChange={(e) => setSearchBy(e.target.value as SearchBy)}
          aria-label="Search by"
          className="appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
        >
          <option value="title">Title</option>
          <option value="imdb_id">IMDb ID</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      </div>

      {/* Media type — default "Movie" */}
      <div className="relative shrink-0">
        <select
          defaultValue="movie"
          aria-label="Media type"
          className="appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
        >
          <option value="movie">Movie</option>
          <option value="series">Series</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      </div>

      {/* Source — OMDb only for now, TMDb added later */}
      <div className="relative shrink-0">
        <select
          defaultValue="omdb"
          aria-label="Source"
          className="appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
        >
          <option value="omdb">OMDb</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      </div>

      {/* Search — no action wired up yet */}
      <button
        type="button"
        className="flex shrink-0 items-center gap-2 rounded-card bg-brand-pink px-6 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
      >
        <Search className="h-4 w-4" />
        Search
      </button>
    </div>
  );
}
