/*
 * What counts as a view, for Trending. Someone pressing Play on a movie,
 * or on any episode of a series (counted for the series), is a view.
 * Each viewer counts once per title per UTC day: a signed-in user by
 * account, a guest by IP address. Viewers are stored as a keyed hash of
 * viewerKey(), which includes the day, so the same person gets a
 * different hash every day.
 */

/** Trending ranks titles by their views over this many days, today included. */
export const TRENDING_DAYS = 7;

/** A UTC calendar day, as "YYYY-MM-DD". */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first day Trending counts: TRENDING_DAYS days ago, today included. */
export function trendingSince(now: Date): string {
  const first = new Date(now);
  first.setUTCDate(first.getUTCDate() - (TRENDING_DAYS - 1));
  return utcDay(first);
}

export type Viewer = { userId: string } | { ip: string };

/** What's hashed to identify a viewer on one day. */
export function viewerKey(day: string, viewer: Viewer): string {
  return "userId" in viewer ? `view:${day}:user:${viewer.userId}` : `view:${day}:ip:${viewer.ip}`;
}
