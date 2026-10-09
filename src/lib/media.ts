export type MediaType = "movie" | "series";

/**
 * The one shared shape for a catalog entry, used everywhere a piece of
 * content is represented: PosterCard/MediaCard, every listing page
 * (Genre/Country/Year/Language/Browse/Trending/New Releases), search
 * suggestions, and findBasicTitle's fallback lookup.
 *
 * Not every mock source populates every optional field yet — Trending's
 * generated catalog has no country/language, the hand-authored home-page
 * arrays have no createdAt, etc. That's fine; the point of unifying on
 * one type is that everything agrees on the *name* of a field it does
 * have (`title`, not `name` in one place and `title` in another), not
 * that every source must populate all of them.
 */
export type Media = {
  id: string;
  title: string;
  year: number;
  duration: string;
  type: MediaType;
  genre: string;
  posterUrl: string;

  country?: string;
  language?: string;
  createdAt?: string;
  /**
   * When this record last changed — distinct from createdAt on purpose.
   * An old title can be edited today (fixing a typo, replacing a
   * poster) without changing when it was originally added. Sorting by
   * this instead of createdAt is what "recently edited" listings
   * (/movie) mean, versus "recently added" ones (/new-releases).
   */
  updatedAt?: string;
  /** Draft titles exist in the catalog but shouldn't appear on any
   *  public-facing listing — see mock-media.ts for which pages filter
   *  on this and which (so far) don't. */
  status?: "draft" | "published";
  synopsis?: string;
  /** Tailwind gradient classes — placeholder loading-color / accent, from
   *  before posterUrl was the main visual. Only some sources set this. */
  gradient?: string;
  /** Landscape backdrop image, 16:9 — only the home page Hero uses this. */
  backdropUrl?: string;

  /**
   * Reserved for when real video data arrives. Deliberately shaped
   * differently per type: a movie is one file, a series is one file
   * *per episode* — so a single flat `mediaSource` on every Media
   * wouldn't actually fit a series. Movies use `mediaSource` directly;
   * series use `episodes`, where each episode carries its own source.
   * mock-series-details.ts populates episode title/season/number/
   * duration/airDate; `mediaSource` itself is still unpopulated
   * everywhere — there's no real video anywhere in this scaffold yet.
   */
  mediaSource?: string;
  episodes?: Episode[];
};

/** One episode of a series — first actually populated by mock-series-details.ts. */
export type Episode = {
  id: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  duration: string;
  /** Display string, e.g. "June 20, 2025" — matches MovieDetail's
   *  releaseDate format rather than a Date/ISO string. */
  airDate?: string;
  mediaSource?: string;
};

/** Trending's ranked catalog — same base fields, plus rank/view count. */
export type TrendingMedia = Media & {
  rank: number;
  viewCount: number;
};

// Deterministic placeholder photos (Picsum) — same seed always returns the
// same image, so a title's poster doesn't change between page loads.
// Swap for real uploaded/imported artwork once the database exists.
// Shared by every mock-data generator so there's one implementation, not
// one per file.
export const poster = (seed: string) =>
  `https://picsum.photos/seed/${seed}/500/750`;

export const backdrop = (seed: string) =>
  `https://picsum.photos/seed/${seed}-backdrop/1600/900`;

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
