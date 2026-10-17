/**
 * Shared pagination math for every listing page: clamp the requested
 * page into range, then take that page. Centralizing it means the "24
 * divides evenly into every breakpoint's column count" constant lives in
 * exactly one place too.
 */
export const PAGE_SIZE = 24;

/**
 * The page to show out of `total` items, and how many items come before
 * it. Database listings count first, then fetch `skip` onward.
 */
export function pageWindow(total: number, requestedPage: number, perPage: number = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, requestedPage || 1), totalPages);
  return { page, totalPages, skip: (page - 1) * perPage };
}

/** pageWindow() for a list already in memory. */
export function paginate<T>(
  items: T[],
  requestedPage: number,
  perPage: number = PAGE_SIZE
) {
  const { page, totalPages, skip } = pageWindow(items.length, requestedPage, perPage);
  return {
    page,
    totalPages,
    pageItems: items.slice(skip, skip + perPage),
  };
}

/**
 * The page numbers a pager shows: the first, the last, and the ones next
 * to `page`, with null where it skips some ("1 … 4 5 6 … 20").
 */
export function pageNumbers(page: number, totalPages: number): (number | null)[] {
  const shown = new Set([1, page - 1, page, page + 1, totalPages]);
  const pages = [...shown].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const n of pages) {
    const previous = result.at(-1);
    // A gap of exactly one page shows that page rather than "…".
    if (typeof previous === "number" && n - previous === 2) result.push(previous + 1);
    else if (typeof previous === "number" && n - previous > 2) result.push(null);
    result.push(n);
  }
  return result;
}
