import Link from "next/link";

/**
 * Plain Previous/Next text (no arrow/chevron icons, per instruction),
 * disabled-looking non-link spans at the boundaries. `makeHref` builds
 * the URL for a given page number — each page owns its own query-string
 * logic (type/sort for Trending, genre for Genre, etc.), this component
 * only needs page numbers in and hrefs out.
 */
export default function Pagination({
  page,
  totalPages,
  makeHref,
}: {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
}) {
  return (
    <div className="mt-12 flex items-center justify-center gap-4">
      {page > 1 ? (
        <Link
          href={makeHref(page - 1)}
          className="rounded-card border border-border-strong px-6 py-2.5 text-sm font-bold text-ink-primary transition-colors hover:bg-bg-elevated"
        >
          Previous
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="rounded-card border border-border-subtle px-6 py-2.5 text-sm font-bold text-ink-disabled"
        >
          Previous
        </span>
      )}

      <span className="text-sm text-ink-muted">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link
          href={makeHref(page + 1)}
          className="rounded-card border border-border-strong px-6 py-2.5 text-sm font-bold text-ink-primary transition-colors hover:bg-bg-elevated"
        >
          Next
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="rounded-card border border-border-subtle px-6 py-2.5 text-sm font-bold text-ink-disabled"
        >
          Next
        </span>
      )}
    </div>
  );
}
