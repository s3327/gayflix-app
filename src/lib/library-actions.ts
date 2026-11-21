"use server";

import type { Kysely } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { HISTORY_LIMIT, trimHistory } from "@/lib/library";
import {
  cleanListName,
  isMediaId,
  MAX_FAVORITES,
  MAX_WATCHLIST,
  MAX_LIST_ITEMS,
  MAX_LISTS,
  parseEntry,
  type FavoriteEntry,
} from "@/lib/library-types";
import { getSession } from "@/lib/session";
import { countOf } from "@/lib/sql-helpers";
import { parseProgress } from "@/lib/watch-progress";

/*
 * Server functions behind the Favorites, Watchlist, History and Lists
 * providers.
 * Each one is reachable by a direct POST, so each checks the session and
 * validates its input itself; list functions also check that the list
 * belongs to the caller. They throw on bad input or no session; the
 * providers undo their optimistic update and show a toast.
 */

const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  return session.user.id;
}

function requireEntry(value: unknown): FavoriteEntry {
  const entry = parseEntry(value);
  if (!entry) throw new Error("Invalid title");
  return entry;
}

function requireMediaId(value: unknown): string {
  if (!isMediaId(value)) throw new Error("Invalid id");
  return value;
}

async function requireOwnList(
  userId: string,
  listId: unknown,
  executor: Kysely<DB> = database
): Promise<string> {
  if (typeof listId !== "string" || !LIST_ID.test(listId)) throw new Error("Invalid list");
  const list = await executor
    .selectFrom("media_list")
    .select("id")
    .where("id", "=", listId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (!list) throw new Error("List not found");
  return list.id;
}

// --- Favorites ---------------------------------------------------------

export async function setFavorite(
  value: unknown,
  on: boolean,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const entry = requireEntry(value);
  if (on) {
    const row = await executor
      .selectFrom("favorite")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    if (countOf(row) >= MAX_FAVORITES) {
      throw new Error("Too many favorites");
    }
    await executor
      .insertInto("favorite")
      .values({ userId, mediaId: entry.id, entry: JSON.stringify(entry) })
      .onConflict((oc) =>
        oc.columns(["userId", "mediaId"]).doUpdateSet({ entry: JSON.stringify(entry) })
      )
      .execute();
  } else {
    await executor
      .deleteFrom("favorite")
      .where("userId", "=", userId)
      .where("mediaId", "=", entry.id)
      .execute();
  }
}

// --- Watchlist ---------------------------------------------------------

export async function setWatchlist(
  value: unknown,
  on: boolean,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const entry = requireEntry(value);
  if (on) {
    const row = await executor
      .selectFrom("watchlist_item")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    if (countOf(row) >= MAX_WATCHLIST) {
      throw new Error("Watchlist full");
    }
    await executor
      .insertInto("watchlist_item")
      .values({ userId, mediaId: entry.id, entry: JSON.stringify(entry) })
      .onConflict((oc) =>
        oc.columns(["userId", "mediaId"]).doUpdateSet({ entry: JSON.stringify(entry) })
      )
      .execute();
  } else {
    await executor
      .deleteFrom("watchlist_item")
      .where("userId", "=", userId)
      .where("mediaId", "=", entry.id)
      .execute();
  }
}

// --- History -----------------------------------------------------------

export async function recordWatch(
  value: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const entry = requireEntry(value);
  const watchedAt = new Date();
  await executor
    .insertInto("watch_history")
    .values({ userId, mediaId: entry.id, entry: JSON.stringify(entry), watchedAt })
    .onConflict((oc) =>
      oc.columns(["userId", "mediaId"]).doUpdateSet({
        entry: JSON.stringify(entry),
        watchedAt,
        hiddenFromContinue: false,
      })
    )
    .execute();
  await trimHistory(userId, executor);
}

/**
 * How far into a title (`mediaId`, a movie's or an episode's id) the
 * player got, saved as it plays. It only updates the History entry
 * recordWatch made when playing began, so it can't add titles.
 */
export async function saveProgress(
  mediaId: unknown,
  position: unknown,
  duration: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const id = requireMediaId(mediaId);
  const progress = parseProgress(position, duration);
  if (!progress) throw new Error("Invalid progress");
  await executor
    .updateTable("watch_history")
    .set({ progressSeconds: progress.position, durationSeconds: progress.duration })
    .where("userId", "=", userId)
    .where("mediaId", "=", id)
    .execute();
}

/** Takes a title off Continue Watching, or puts it back (Undo). It stays in History. */
export async function setHiddenFromContinue(
  mediaId: unknown,
  hidden: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const id = requireMediaId(mediaId);
  if (typeof hidden !== "boolean") throw new Error("Invalid setting");
  await executor
    .updateTable("watch_history")
    .set({ hiddenFromContinue: hidden })
    .where("userId", "=", userId)
    .where("mediaId", "=", id)
    .execute();
}

/**
 * Moves history recorded while logged out (kept in this browser) into
 * the account, keeping whichever watch time is newer.
 */
export async function importHistory(
  values: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  if (!Array.isArray(values)) throw new Error("Invalid history");
  for (const value of values.slice(0, HISTORY_LIMIT)) {
    const entry = parseEntry(value);
    const watchedAt = new Date((value as { watchedAt?: unknown })?.watchedAt as string);
    if (!entry || Number.isNaN(watchedAt.getTime()) || watchedAt > new Date()) continue;
    const existing = await executor
      .selectFrom("watch_history")
      .select("watchedAt")
      .where("userId", "=", userId)
      .where("mediaId", "=", entry.id)
      .executeTakeFirst();
    if (existing && new Date(existing.watchedAt) >= watchedAt) continue;
    await executor
      .insertInto("watch_history")
      .values({ userId, mediaId: entry.id, entry: JSON.stringify(entry), watchedAt })
      .onConflict((oc) =>
        oc.columns(["userId", "mediaId"]).doUpdateSet({
          entry: JSON.stringify(entry),
          watchedAt,
        })
      )
      .execute();
  }
  await trimHistory(userId, executor);
}

export async function removeFromHistory(
  mediaId: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  await executor
    .deleteFrom("watch_history")
    .where("userId", "=", userId)
    .where("mediaId", "=", requireMediaId(mediaId))
    .execute();
}

export async function clearHistory(executor: Kysely<DB> = database): Promise<void> {
  const userId = await requireUserId();
  await executor.deleteFrom("watch_history").where("userId", "=", userId).execute();
}

// --- Lists -------------------------------------------------------------

export async function createList(
  id: unknown,
  name: unknown,
  firstItem?: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  if (typeof id !== "string" || !LIST_ID.test(id)) throw new Error("Invalid list");
  const entry = firstItem === undefined ? null : requireEntry(firstItem);
  const row = await executor
    .selectFrom("media_list")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("userId", "=", userId)
    .executeTakeFirstOrThrow();
  if (countOf(row) >= MAX_LISTS) {
    throw new Error("Too many lists");
  }

  const runInsert = async (target: Kysely<DB>) => {
    await target
      .insertInto("media_list")
      .values({
        id,
        userId,
        name: cleanListName(name),
      })
      .execute();
    if (entry) {
      await target
        .insertInto("list_item")
        .values({
          listId: id,
          mediaId: entry.id,
          entry: JSON.stringify(entry),
        })
        .execute();
    }
  };

  if (executor.isTransaction) {
    await runInsert(executor);
  } else {
    await executor.transaction().execute(runInsert);
  }
}

export async function deleteList(listId: unknown, executor: Kysely<DB> = database): Promise<void> {
  const userId = await requireUserId();
  const id = await requireOwnList(userId, listId, executor);
  await executor.deleteFrom("media_list").where("id", "=", id).execute();
}

export async function renameList(
  listId: unknown,
  name: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const id = await requireOwnList(userId, listId, executor);
  await executor
    .updateTable("media_list")
    .set({ name: cleanListName(name) })
    .where("id", "=", id)
    .execute();
}

/**
 * Shares a list with anyone who has its link, or makes it private again,
 * which also takes it off Community Lists.
 */
export async function setListPublic(
  listId: unknown,
  isPublic: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  if (typeof isPublic !== "boolean") throw new Error("Invalid setting");
  const id = await requireOwnList(userId, listId, executor);
  await executor
    .updateTable("media_list")
    .set(isPublic ? { isPublic } : { isPublic, inCommunity: false })
    .where("id", "=", id)
    .execute();
}

export async function addToList(
  listId: unknown,
  value: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const id = await requireOwnList(userId, listId, executor);
  const entry = requireEntry(value);
  const row = await executor
    .selectFrom("list_item")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("listId", "=", id)
    .executeTakeFirstOrThrow();
  if (countOf(row) >= MAX_LIST_ITEMS) {
    throw new Error("List is full");
  }
  await executor
    .insertInto("list_item")
    .values({ listId: id, mediaId: entry.id, entry: JSON.stringify(entry) })
    .onConflict((oc) => oc.columns(["listId", "mediaId"]).doNothing())
    .execute();
}

export async function removeFromList(
  listId: unknown,
  mediaId: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  const id = await requireOwnList(userId, listId, executor);
  await executor
    .deleteFrom("list_item")
    .where("listId", "=", id)
    .where("mediaId", "=", requireMediaId(mediaId))
    .execute();
}

export { trimHistory } from "@/lib/library";
