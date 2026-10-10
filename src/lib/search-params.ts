/**
 * What a page's `searchParams` resolves to. A key repeated in the URL
 * (`?q=a&q=b`) arrives as an array, so every reader has to cope with
 * both shapes — these helpers are that one place.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a query param, ignoring any repeats. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `?page=` as a positive integer, falling back to 1 for anything else. */
export function pageParam(value: string | string[] | undefined): number {
  const page = Number(firstParam(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}
