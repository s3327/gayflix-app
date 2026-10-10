export type MediaType = "movie" | "series";
export type MediaStatus = "draft" | "published";

/**
 * A title as cards show it: home rows, listings, search results and
 * recommendations. Read from the database through src/lib/catalog.ts,
 * which only ever returns published titles to the public site.
 */
export type Media = {
  id: string;
  type: MediaType;
  title: string;
  year: number;
  /** "1h 52m" for a movie, "3 Seasons" for a series. */
  duration: string;
  /** The main genre (a title can have several). */
  genre: string;
  posterUrl: string;
  /** Tailwind gradient stops shown behind the poster while it loads. */
  gradient?: string;
  /** When the title was added to the catalog (ISO string). */
  createdAt: string;
};

/** Trending's ranked list: the most viewed published titles. */
export type TrendingMedia = Media & {
  rank: number;
  viewCount: number;
};

/** One episode of a series. */
export type Episode = {
  id: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  /** As shown: "42 min". */
  duration: string;
  /** Display string, e.g. "June 20, 2025". */
  airDate?: string;
};

/**
 * Everything a title's own page shows. Optional fields are left out
 * when the title doesn't have them, and the page skips them.
 */
export type MediaDetail = Media & {
  genres: string[];
  country: string;
  language: string;
  synopsis: string;
  tagline?: string;
  /** 0 to 5. */
  rating?: number;
  /** Movies. */
  director?: string;
  /** Series. */
  creator?: string;
  cast: string[];
  tags: string[];
  /** Display string, e.g. "June 20, 2025". */
  releaseDate?: string;
  /** Movies. */
  runtimeMinutes?: number;
  /** 16:9, for the home page hero. */
  backdropUrl?: string;
  /** Series only, in season and episode order. */
  episodes: Episode[];
};
