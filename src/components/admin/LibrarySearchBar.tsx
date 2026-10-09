import { Search, ChevronDown } from "lucide-react";

/**
 * Search bar for library list pages (Movies now, Series/Episodes later —
 * same component, since the layout and fields are identical). UI only —
 * no submit handler, no filtering logic yet.
 */
export default function LibrarySearchBar() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-10">
      {/* Text field — takes all remaining space */}
      <input
        type="text"
        placeholder="Search by title"
        className="min-w-[200px] flex-1 rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-none"
      />

      {/* Status — default "All" */}
      <div className="relative shrink-0">
        <select
          defaultValue="all"
          aria-label="Status"
          className="appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-none"
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
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
