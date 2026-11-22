import { jsonArrayFrom } from "kysely/helpers/postgres";
import type { Kysely } from "kysely";
import { findPublishedIds } from "@/lib/catalog";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { isMediaId, type FavoriteEntry, type HistoryEntry, type Library, type MediaList } from "@/lib/library-types";
import { getSession } from "@/lib/session";
import { resumePosition } from "@/lib/watch-progress";

/** How many history entries an account keeps (oldest drop off). */
export const HISTORY_LIMIT = 200;

function parseEntryValue(entry: unknown): FavoriteEntry {
  if (typeof entry === "string") {
    try {
      return JSON.parse(entry) as FavoriteEntry;
    } catch {
      return entry as unknown as FavoriteEntry;
    }
  }
  return entry as FavoriteEntry;
}

/**
 * Everything a signed-in user has saved, shaped the way the client
 * providers hold it. Server code only.
 */
export async function loadLibrary(
  userId: string,
  executor: Kysely<DB> = database
): Promise<Library> {
  const [favorites, watchlist, history, lists, ratings] = await Promise.all([
    executor
      .selectFrom("favorite")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("createdAt", "asc")
      .execute(),
    executor
      .selectFrom("watchlist_item")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("addedAt", "asc")
      .execute(),
    executor
      .selectFrom("watch_history")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("watchedAt", "desc")
      .limit(HISTORY_LIMIT)
      .execute(),
    executor
      .selectFrom("media_list")
      .selectAll("media_list")
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom("list_item")
            .select(["list_item.mediaId", "list_item.entry", "list_item.addedAt"])
            .whereRef("list_item.listId", "=", "media_list.id")
            .orderBy("list_item.addedAt", "asc")
        ).as("items"),
      ])
      .where("media_list.userId", "=", userId)
      .orderBy("media_list.createdAt", "asc")
      .execute(),
    executor
      .selectFrom("media_rating")
      .select(["mediaId", "value"])
      .where("userId", "=", userId)
      .execute(),
  ]);

  // Titles taken off the site since they were saved stay saved, but out
  // of sight until they're back.
  const published = await findPublishedIds([
    ...favorites.map((row) => row.mediaId),
    ...watchlist.map((row) => row.mediaId),
    ...history.map((row) => row.mediaId),
    ...lists.flatMap((list) => list.items.map((item) => item.mediaId)),
    ...ratings.map((row) => row.mediaId),
  ]);
  const shown = <T extends { mediaId: string }>(rows: T[]) =>
    rows.filter((row) => published.has(row.mediaId));

  return {
    favorites: Object.fromEntries(
      shown(favorites).map((row) => [row.mediaId, parseEntryValue(row.entry)])
    ),
    watchlist: Object.fromEntries(
      shown(watchlist).map((row) => [row.mediaId, parseEntryValue(row.entry)])
    ),
    history: Object.fromEntries(
      shown(history).map((row) => [
        row.mediaId,
        {
          ...parseEntryValue(row.entry),
          watchedAt: (row.watchedAt instanceof Date ? row.watchedAt : new Date(row.watchedAt)).toISOString(),
        } satisfies HistoryEntry,
      ])
    ),
    lists: Object.fromEntries(
      lists.map((list) => [list.id, toMediaList({ ...list, items: shown(list.items) })])
    ),
    ratings: Object.fromEntries(shown(ratings).map((row) => [row.mediaId, row.value])),
  };
}

export function toMediaList(list: {
  id: string;
  name: string;
  isPublic: boolean;
  inCommunity: boolean;
  communityBlocked: boolean;
  createdAt: Date | string;
  items: { entry: unknown }[];
}): MediaList {
  return {
    id: list.id,
    name: list.name,
    isPublic: list.isPublic,
    inCommunity: list.inCommunity,
    communityBlocked: list.communityBlocked,
    createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : new Date(list.createdAt).toISOString(),
    items: list.items.map((item) => parseEntryValue(item.entry)),
  };
}

/**
 * A list, for /list/[id]. The page shows it to its owner, and to anyone
 * with the link once the owner shares it (list ids are random UUIDs).
 * Like loadLibrary, it leaves out titles that aren't published now.
 */
export async function findList(id: string, executor: Kysely<DB> = database) {
  const list = await executor
    .selectFrom("media_list")
    .selectAll("media_list")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("list_item")
          .select(["list_item.mediaId", "list_item.entry", "list_item.addedAt"])
          .whereRef("list_item.listId", "=", "media_list.id")
          .orderBy("list_item.addedAt", "asc")
      ).as("items"),
    ])
    .where("media_list.id", "=", id)
    .executeTakeFirst();
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
export async function getResumePosition(
  mediaId: string,
  executor: Kysely<DB> = database
): Promise<number> {
  const session = await getSession();
  if (!session || !isMediaId(mediaId)) return 0;
  const row = await executor
    .selectFrom("watch_history")
    .select(["progressSeconds", "durationSeconds"])
    .where("userId", "=", session.user.id)
    .where("mediaId", "=", mediaId)
    .executeTakeFirst();
  return row ? resumePosition({ position: row.progressSeconds, duration: row.durationSeconds }) : 0;
}

export async function trimHistory(
  userId: string,
  executor: Kysely<DB> = database
): Promise<void> {
  const overflow = await executor
    .selectFrom("watch_history")
    .select("mediaId")
    .where("userId", "=", userId)
    .orderBy("watchedAt", "desc")
    .offset(HISTORY_LIMIT)
    .execute();
  if (overflow.length > 0) {
    await executor
      .deleteFrom("watch_history")
      .where("userId", "=", userId)
      .where(
        "mediaId",
        "in",
        overflow.map((row) => row.mediaId)
      )
      .execute();
  }
}
