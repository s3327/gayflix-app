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

  return {
    favorites: Object.fromEntries(
      favorites.map((row) => [row.mediaId, row.entry as FavoriteEntry])
    ),
    history: Object.fromEntries(
      history.map((row) => [
        row.mediaId,
        { ...(row.entry as FavoriteEntry), watchedAt: row.watchedAt.toISOString() } satisfies HistoryEntry,
      ])
    ),
    lists: Object.fromEntries(lists.map((list) => [list.id, toMediaList(list)])),
  };
}

export function toMediaList(list: {
  id: string;
  name: string;
  createdAt: Date;
  items: { entry: unknown }[];
}): MediaList {
  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt.toISOString(),
    items: list.items.map((item) => item.entry as FavoriteEntry),
  };
}

/** A list anyone with the link can view (list ids are random UUIDs). */
export async function findList(id: string) {
  const list = await db.mediaList.findUnique({
    where: { id },
    include: { items: { orderBy: { addedAt: "asc" } } },
  });
  return list ? { ownerId: list.userId, list: toMediaList(list) } : null;
}
