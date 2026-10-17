import Link from "next/link";
import { pageNumbers } from "@/lib/paginate";

const BUTTON = "rounded-card border px-4 py-2.5 text-sm font-bold sm:px-6";
const LINK = `${BUTTON} border-border-strong text-ink-primary transition-colors hover:bg-bg-elevated`;
const DISABLED = `${BUTTON} border-border-subtle text-ink-disabled`;
const NUMBER =
  "flex h-10 min-w-10 items-center justify-center rounded-card px-2 text-sm font-semibold";

/**
 * Previous, the page numbers, and Next; nothing when everything fits on
 * one page. Phones show "Page 2 of 9" in place of the numbers.
 * `makeHref` builds the URL for a page number, since each listing owns
 * its own query string (a search's ?q=, Browse's filters).
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
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className={LINK}>
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={DISABLED}>
          Previous
        </span>
      )}

      <span className="text-sm text-ink-muted sm:sr-only">
        Page {page} of {totalPages}
      </span>
      <ol className="hidden items-center gap-1 sm:flex">
        {pageNumbers(page, totalPages).map((n, index) =>
          n === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-ink-muted">
              …
            </li>
          ) : (
            <li key={n}>
              {n === page ? (
                <span
                  aria-current="page"
                  className={`${NUMBER} bg-brand-pink text-ink-onBrand`}
                >
                  {n}
                </span>
              ) : (
                <Link
                  href={makeHref(n)}
                  aria-label={`Page ${n}`}
                  className={`${NUMBER} text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary`}
                >
                  {n}
                </Link>
              )}
            </li>
          )
        )}
      </ol>

      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className={LINK}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={DISABLED}>
          Next
        </span>
      )}
    </nav>
  );
}
