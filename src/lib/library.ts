import { findPublishedIds } from "@/lib/catalog";
import { db } from "@/lib/db";
import type { FavoriteEntry, HistoryEntry, Library, MediaList } from "@/lib/library-types";

/** How many history entries an account keeps (oldest drop off). */
export const HISTORY_LIMIT = 200;

/**
 * Everything a signed-in user has saved, shaped the way the client
 * providers hold it. Server code only.
 */
export async function loadLibrary(userId: string): Promise<Library> {
  const [favorites, history, lists] = await Promise.all([
    db.favorite.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
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
    ...history.map((row) => row.mediaId),
    ...lists.flatMap((list) => list.items.map((item) => item.mediaId)),
  ]);
  const shown = <T extends { mediaId: string }>(rows: T[]) =>
    rows.filter((row) => published.has(row.mediaId));

  return {
    favorites: Object.fromEntries(
      shown(favorites).map((row) => [row.mediaId, row.entry as FavoriteEntry])
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
