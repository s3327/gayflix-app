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
