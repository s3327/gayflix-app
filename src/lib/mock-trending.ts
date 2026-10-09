import { type TrendingMedia, poster, slugify } from "@/lib/media";

const ADJECTIVES = [
  "Chosen", "Hidden", "Golden", "Silent", "Broken", "Electric", "Velvet",
  "Neon", "Wild", "Quiet", "Radiant", "Faded", "Sacred", "Restless",
  "Tender", "Fierce", "Gentle", "Bold", "Lucky", "Endless",
];

const NOUNS = [
  "Family", "Hearts", "Nights", "Summer", "Vows", "Letters", "Horizon",
  "Harbor", "Garden", "Parade", "Anthem", "Reunion", "Confession", "Bloom",
  "Echo", "Lantern", "Runway", "Chapter", "Compass", "Season",
];

const GENRES = [
  "Drama", "Comedy", "Romance", "Documentary", "Coming of Age", "Reality", "Musical",
];

// Every catalog-shaped dataset carries status/updatedAt now, even this
// one — the earlier reasoning ("a draft can't realistically be
// trending") is true today, but baking that assumption into the data
// shape itself means the day trending is computed differently (an
// admin-seeded/boosted slot, a different ranking source) there's no
// schema change needed to enforce it, just a filter that's already
// there and already wired through findBasicTitle. Consistency now,
// not because there's a live leak today.
function generateTrending(): TrendingMedia[] {
  const items: TrendingMedia[] = [];
  const today = new Date();

  outer: for (const adj of ADJECTIVES) {
    for (const noun of NOUNS) {
      if (items.length >= 100) break outer;

      const rank = items.length + 1;
      const title = `${adj} ${noun}`;
      const id = slugify(title);
      const isSeries = rank % 3 === 0; // roughly 1 in 3 are series
      const year = 2021 + (rank % 6);
      const genre = GENRES[rank % GENRES.length];

      // Same scrambling approach as mock-media.ts's updatedAt — not
      // derived from rank, so "recently edited" ordering (used by
      // /movie and /series, not by this page) doesn't just reproduce
      // rank order.
      const editScramble = (rank * 41 + 7) % 200;
      const updatedAt = new Date(today);
      updatedAt.setDate(today.getDate() - editScramble);

      // Roughly 1 in 6 are drafts, same ratio as mock-media.ts — see
      // publishedTrendingItems below for where this actually gets
      // enforced.
      const status: TrendingMedia["status"] = rank % 6 === 5 ? "draft" : "published";

      items.push({
        id,
        title,
        year,
        duration: isSeries
          ? `${1 + (rank % 4)} Season${1 + (rank % 4) === 1 ? "" : "s"}`
          : `1h ${20 + (rank % 40)}m`,
        type: isSeries ? "series" : "movie",
        genre,
        posterUrl: poster(id),
        updatedAt: updatedAt.toISOString(),
        status,
        // Long-tail descending curve — always strictly decreasing as rank
        // increases, so "top 100 by views" is true by construction rather
        // than needing a separate sort step.
        viewCount: Math.round(4_800_000 / Math.pow(rank, 0.62)),
        rank,
      });
    }
  }

  return items;
}

// Placeholder — swap for a real query
// (`ORDER BY view_count DESC LIMIT 100`, computed from watch history)
// once accounts + a database exist.
export const trendingItems: TrendingMedia[] = generateTrending();

// Public-facing Trending page reads this, not trendingItems — same
// publishedMediaItems pattern as mock-media.ts. Ranks are renumbered
// after filtering (not just filtered in place): removing drafts without
// renumbering would leave gaps in the displayed "#1, #2, #4, ..." rank
// badges, which reads as a bug, not as "some items are hidden." What's
// shown as #3 should be the third-highest-viewed *published* title, not
// a literal index into the unfiltered top 100.
export const publishedTrendingItems: TrendingMedia[] = trendingItems
  .filter((item) => item.status === "published")
  .map((item, index) => ({ ...item, rank: index + 1 }));
