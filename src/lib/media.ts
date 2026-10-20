import type { WatchProgress } from "@/lib/watch-progress";
import type { MaturityRating } from "@/lib/title-extras";

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
  /** When the title was first published (ISO string). */
  publishedAt?: string;
};

/** Trending's ranked list: the most viewed published titles of the week. */
export type TrendingMedia = Media & {
  rank: number;
  /** Views in the last 7 days (see src/lib/views.ts). */
  views: number;
};

/**
 * A title on Continue Watching: one the signed-in user played lately. A
 * series comes with the episode they played last, or the next one once
 * that was watched to the end.
 */
export type RecentlyWatched = Media & {
  /** 16:9, when the title has one; cards fall back to the poster. */
  backdropUrl?: string;
  /** The History entry's id (a movie's or an episode's): what Remove takes off the row. */
  historyId: string;
  episode?: {
    id: string;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    /** The episode after the one watched to the end, not started yet. */
    isNext?: true;
  };
  /** How far in, when the player could tell (a file or a stream, not an embed). */
  progress?: WatchProgress;
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
  /** 16:9 still thumbnail image URL */
  stillUrl?: string | null;
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
  /** 16:9, for the home page hero and the title page's header. */
  backdropUrl?: string;
  /** A YouTube watch link. */
  trailerUrl?: string;
  /** MATURITY_RATINGS in src/lib/title-extras.ts. */
  maturityRating?: MaturityRating;
  /** CONTENT_NOTES codes, in that list's order. */
  contentNotes: string[];
  /** Series only, in season and episode order. */
  episodes: Episode[];
};
