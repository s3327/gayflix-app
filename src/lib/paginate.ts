/**
 * Shared pagination math — every listing page (Genre/Country/Year/
 * Language/Browse/Trending/New Releases) computes this identically:
 * clamp the requested page into range, then slice. Centralizing it
 * means the "24 divides evenly into every breakpoint's column count"
 * constant lives in exactly one place too.
 */
export const PAGE_SIZE = 24;

export function paginate<T>(
  items: T[],
  requestedPage: number,
  perPage: number = PAGE_SIZE
) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(Math.max(1, requestedPage || 1), totalPages);
  const start = (page - 1) * perPage;
  return {
    page,
    totalPages,
    pageItems: items.slice(start, start + perPage),
  };
}
