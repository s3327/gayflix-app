import { movies, series, newReleases, trendingNow } from "@/lib/mock-titles";
import { publishedTrendingItems } from "@/lib/mock-trending";
import { publishedMediaItems } from "@/lib/mock-media";
import type { Media } from "@/lib/media";

export type BasicTitle = Pick<
  Media,
  | "id"
  | "title"
  | "year"
  | "genre"
  | "duration"
  | "posterUrl"
  | "type"
  | "gradient"
  | "synopsis"
  | "country"
  | "language"
>;

// Every pool that might contain an id /movie/[id] or /series/[id] needs to
// resolve — all three now share the same Media shape (title, not a mix of
// title/name), so this is one loop instead of one copy-pasted block per
// pool.
//
// Uses publishedMediaItems/publishedTrendingItems, not the raw arrays — a
// draft shouldn't be directly reachable at /movie/[id] or /series/[id]
// just because its id is known (e.g. a stale/guessed link), even though
// nothing in the UI ever links to it. "Draft" means gated from the
// public entirely, not just hidden from listings. mock-titles has no
// draft concept at all (see that file for why that's fine, not an
// oversight).
const POOLS: Media[][] = [
  [...movies, ...series, ...newReleases, ...trendingNow],
  publishedTrendingItems,
  publishedMediaItems,
];

/**
 * Every title a visitor can open at /movie/[id] or /series/[id], once
 * each (an id in several pools resolves to the first, as in
 * findBasicTitle). Used by the sitemap.
 */
export function listPublicTitles(): Media[] {
  const seen = new Set<string>();
  return POOLS.flat().filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Looks for basic (not full-detail) info for an id across every mock
 * source that has it — used as a fallback by /movie/[id] and /series/[id]
 * when the id isn't in the rich mock-movie-details dataset (which only
 * covers 4 titles). This is what lets every card in Trending's 100-item
 * mock list, and every card sourced from the shared media catalog
 * (New Releases/Genre/Country/Year/Language/Browse, and search
 * suggestions), actually navigate somewhere real instead of 404ing.
 */
export function findBasicTitle(id: string): BasicTitle | undefined {
  for (const pool of POOLS) {
    const found = pool.find((item) => item.id === id);
    if (found) {
      return {
        id: found.id,
        title: found.title,
        year: found.year,
        genre: found.genre,
        duration: found.duration,
        posterUrl: found.posterUrl,
        type: found.type,
        gradient: found.gradient,
        synopsis: found.synopsis,
        country: found.country,
        language: found.language,
      };
    }
  }
  return undefined;
}
