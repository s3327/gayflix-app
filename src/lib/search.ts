import { publishedMediaItems } from "@/lib/mock-media";
import type { Media } from "@/lib/media";

export const MAX_SUGGESTIONS = 6;
/** Longer queries are cut to this before matching — no title is anywhere near it. */
export const MAX_QUERY_LENGTH = 100;

/** What the header's live search needs per result — nothing more goes over the wire. */
export type SearchSuggestion = Pick<Media, "id" | "title" | "type" | "year" | "posterUrl">;

/**
 * Titles starting with the query rank above titles that merely contain
 * it elsewhere ("Loud" beats "The Loud House" for query "loud"), each
 * group then alphabetized for stable ordering as the user keeps typing.
 *
 * Searches publishedMediaItems, not mediaItems — a draft shouldn't be
 * findable by search any more than it should show up on a listing page.
 * `items` is only overridable so tests can pass a fixed catalog.
 */
export function getSuggestions(
  query: string,
  items: Media[] = publishedMediaItems
): SearchSuggestion[] {
  const q = query.slice(0, MAX_QUERY_LENGTH).trim().toLowerCase();
  if (!q) return [];

  const startsWith: Media[] = [];
  const contains: Media[] = [];

  for (const item of items) {
    const title = item.title.toLowerCase();
    if (title.startsWith(q)) startsWith.push(item);
    else if (title.includes(q)) contains.push(item);
  }

  const byTitle = (a: Media, b: Media) => a.title.localeCompare(b.title);
  return [...startsWith.sort(byTitle), ...contains.sort(byTitle)]
    .slice(0, MAX_SUGGESTIONS)
    .map(({ id, title, type, year, posterUrl }) => ({ id, title, type, year, posterUrl }));
}
