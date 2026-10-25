/*
 * Member ratings (media_rating): what a member can say about a movie or a
 * series, and when a title counts as "Most liked". Shared by the server
 * (src/lib/rating-actions.ts, src/lib/catalog.ts) and the browser.
 */

/** Not for me, Like, Love it, in the order the buttons show them. */
export const RATINGS = ["not_for_me", "like", "love"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABELS: Record<Rating, string> = {
  not_for_me: "Not for me",
  like: "Like",
  love: "Love it",
};

/** A generous cap, so one account can't fill the database. */
export const MAX_RATINGS = 5000;

export function isRating(value: unknown): value is Rating {
  return typeof value === "string" && (RATINGS as readonly string[]).includes(value);
}

/** A title needs this many ratings before it can be "Most liked"... */
export const MOST_LIKED_MIN_RATINGS = 5;
/** ...and this share of them Like or Love it. */
export const MOST_LIKED_SHARE = 0.8;

/** Whether ratings `liked` (Like or Love it) of `total` make a title "Most liked". */
export function isMostLiked({ liked, total }: { liked: number; total: number }): boolean {
  return total >= MOST_LIKED_MIN_RATINGS && liked >= total * MOST_LIKED_SHARE;
}
