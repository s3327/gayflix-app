import type { Media } from "@/lib/media";

/*
 * Shared by search (src/lib/catalog.ts), the search page and the header's
 * live search. The queries themselves run in the database.
 */

export const MAX_SUGGESTIONS = 6;
/** Longer queries are cut to this before matching — no title is anywhere near it. */
export const MAX_QUERY_LENGTH = 100;

/** What the header's live search needs per result — nothing more goes over the wire. */
export type SearchSuggestion = Pick<Media, "id" | "title" | "type" | "year" | "posterUrl">;

/** A query as it's matched: capped and trimmed. Empty means "no search". */
export function normalizeQuery(query: string): string {
  return query.slice(0, MAX_QUERY_LENGTH).trim();
}

/**
 * Makes text safe inside a LIKE/ILIKE pattern, so `%`, `_` and `\` match
 * themselves instead of acting as wildcards. Prisma's `contains` doesn't
 * do this on its own.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** A four-digit query is also a release year ("2026"). */
export function queryYear(query: string): number | null {
  return /^\d{4}$/.test(query) ? Number(query) : null;
}
