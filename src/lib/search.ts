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

/** The header's live search also suggests this many people (cast, directors, creators). */
export const MAX_PEOPLE_SUGGESTIONS = 3;

/** What /api/search answers. `fuzzy`: nothing matched as typed, so these are close spellings. */
export type SuggestionResponse = {
  results: SearchSuggestion[];
  total: number;
  people: string[];
  fuzzy: boolean;
};

/** Text as fuzzy matching compares it: lowercase, accents off, words split on anything else. */
export function matchWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * How many edits (a letter added, dropped, changed, or two side by side
 * swapped) turn `a` into `b`, stopping early once it's past `max`
 * (then it returns max + 1).
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before = new Array<number>(b.length + 1).fill(0);
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    before = previous;
    previous = row;
  }
  return previous[b.length];
}

/** How many typos a query of this many letters may have: none under 4. */
export function allowedTypos(length: number): number {
  if (length < 4) return 0;
  if (length < 6) return 1;
  if (length < 10) return 2;
  return 3;
}

/**
 * How far `text` is from `query`, compared word for word: the query's
 * words against each run of as many words in the text ("brownston"
 * finds "The Brownstone", "chosen famly" finds "Chosen Family"). Null
 * when it's more typos than the query's length allows.
 */
export function fuzzyDistance(query: string, text: string): number | null {
  const wanted = matchWords(query).join(" ");
  const max = allowedTypos(wanted.replace(/ /g, "").length);
  if (max === 0) return null;
  const words = matchWords(text);
  const span = wanted.split(" ").length;
  const runs =
    words.length <= span
      ? [words.join(" ")]
      : Array.from({ length: words.length - span + 1 }, (_, i) => words.slice(i, i + span).join(" "));
  let best = max + 1;
  for (const run of runs) {
    best = Math.min(best, editDistance(wanted, run, max));
    // Or the start of a longer word, for a query typed only partly: "browmst".
    if (run.length > wanted.length) {
      best = Math.min(best, editDistance(wanted, run.slice(0, wanted.length), max));
    }
    if (best === 0) break;
  }
  return best <= max ? best : null;
}

/**
 * The texts closest to `query` within its typos, closest first (shorter
 * ones first among equals), at most `limit` of them.
 */
export function fuzzyMatches<T>(query: string, items: T[], text: (item: T) => string, limit: number): T[] {
  return items
    .map((item) => ({ item, distance: fuzzyDistance(query, text(item)), length: text(item).length }))
    .filter((match): match is { item: T; distance: number; length: number } => match.distance !== null)
    .sort((a, b) => a.distance - b.distance || a.length - b.length)
    .slice(0, limit)
    .map((match) => match.item);
}

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
