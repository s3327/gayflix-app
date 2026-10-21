import { findPublishedIds } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isMediaId, type FavoriteEntry, type HistoryEntry, type Library, type MediaList } from "@/lib/library-types";
import { getSession } from "@/lib/session";
import { resumePosition } from "@/lib/watch-progress";

/** How many history entries an account keeps (oldest drop off). */
export const HISTORY_LIMIT = 200;

/**
 * Everything a signed-in user has saved, shaped the way the client
 * providers hold it. Server code only.
 */
export async function loadLibrary(userId: string): Promise<Library> {
  const [favorites, watchlist, history, lists] = await Promise.all([
    db.favorite.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.watchlistItem.findMany({ where: { userId }, orderBy: { addedAt: "asc" } }),
    db.watchHistory.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
      take: HISTORY_LIMIT,
    }),
    db.mediaList.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { addedAt: "asc" } } },
    }),
  ]);

  // Titles taken off the site since they were saved stay saved, but out
  // of sight until they're back.
  const published = await findPublishedIds([
    ...favorites.map((row) => row.mediaId),
    ...watchlist.map((row) => row.mediaId),
    ...history.map((row) => row.mediaId),
    ...lists.flatMap((list) => list.items.map((item) => item.mediaId)),
  ]);
  const shown = <T extends { mediaId: string }>(rows: T[]) =>
    rows.filter((row) => published.has(row.mediaId));

  return {
    favorites: Object.fromEntries(
      shown(favorites).map((row) => [row.mediaId, row.entry as FavoriteEntry])
    ),
    watchlist: Object.fromEntries(
      shown(watchlist).map((row) => [row.mediaId, row.entry as FavoriteEntry])
    ),
    history: Object.fromEntries(
      shown(history).map((row) => [
        row.mediaId,
        { ...(row.entry as FavoriteEntry), watchedAt: row.watchedAt.toISOString() } satisfies HistoryEntry,
      ])
    ),
    lists: Object.fromEntries(
      lists.map((list) => [list.id, toMediaList({ ...list, items: shown(list.items) })])
    ),
  };
}

export function toMediaList(list: {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: Date;
  items: { entry: unknown }[];
}): MediaList {
  return {
    id: list.id,
    name: list.name,
    isPublic: list.isPublic,
    createdAt: list.createdAt.toISOString(),
    items: list.items.map((item) => item.entry as FavoriteEntry),
  };
}

/**
 * A list, for /list/[id]. The page shows it to its owner, and to anyone
 * with the link once the owner shares it (list ids are random UUIDs).
 * Like loadLibrary, it leaves out titles that aren't published now.
 */
export async function findList(id: string) {
  const list = await db.mediaList.findUnique({
    where: { id },
    include: { items: { orderBy: { addedAt: "asc" } } },
  });
  if (!list) return null;
  const published = await findPublishedIds(list.items.map((item) => item.mediaId));
  const items = list.items.filter((item) => published.has(item.mediaId));
  return { ownerId: list.userId, list: toMediaList({ ...list, items }) };
}

/**
 * Where the signed-in user's player picks up a movie or an episode, in
 * seconds: where they stopped, or 0 to start from the beginning (and
 * always for guests, whose progress isn't saved).
 */
export async function getResumePosition(mediaId: string): Promise<number> {
  const session = await getSession();
  if (!session || !isMediaId(mediaId)) return 0;
  const row = await db.watchHistory.findUnique({
    where: { userId_mediaId: { userId: session.user.id, mediaId } },
    select: { progressSeconds: true, durationSeconds: true },
  });
  return row ? resumePosition({ position: row.progressSeconds, duration: row.durationSeconds }) : 0;
}
