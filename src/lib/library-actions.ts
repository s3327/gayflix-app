"use server";

import { db } from "@/lib/db";
import { HISTORY_LIMIT } from "@/lib/library";
import {
  cleanListName,
  isMediaId,
  MAX_FAVORITES,
  MAX_LIST_ITEMS,
  MAX_LISTS,
  parseEntry,
  type FavoriteEntry,
} from "@/lib/library-types";
import { getSession } from "@/lib/session";
import { parseProgress } from "@/lib/watch-progress";

/*
 * Server functions behind the Favorites, History and Lists providers.
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

async function requireOwnList(userId: string, listId: unknown): Promise<string> {
  if (typeof listId !== "string" || !LIST_ID.test(listId)) throw new Error("Invalid list");
  const list = await db.mediaList.findFirst({ where: { id: listId, userId }, select: { id: true } });
  if (!list) throw new Error("List not found");
  return list.id;
}

// --- Favorites ---------------------------------------------------------

export async function setFavorite(value: unknown, on: boolean): Promise<void> {
  const userId = await requireUserId();
  const entry = requireEntry(value);
  if (on) {
    if ((await db.favorite.count({ where: { userId } })) >= MAX_FAVORITES) {
      throw new Error("Too many favorites");
    }
    await db.favorite.upsert({
      where: { userId_mediaId: { userId, mediaId: entry.id } },
      create: { userId, mediaId: entry.id, entry },
      update: { entry },
    });
  } else {
    await db.favorite.deleteMany({ where: { userId, mediaId: entry.id } });
  }
}

// --- History -----------------------------------------------------------

export async function recordWatch(value: unknown): Promise<void> {
  const userId = await requireUserId();
  const entry = requireEntry(value);
  const watchedAt = new Date();
  await db.watchHistory.upsert({
    where: { userId_mediaId: { userId, mediaId: entry.id } },
    create: { userId, mediaId: entry.id, entry, watchedAt },
    // Watching it again puts it back on Continue Watching.
    update: { entry, watchedAt, hiddenFromContinue: false },
  });
  await trimHistory(userId);
}

/**
 * How far into a title (`mediaId`, a movie's or an episode's id) the
 * player got, saved as it plays. It only updates the History entry
 * recordWatch made when playing began, so it can't add titles.
 */
export async function saveProgress(
  mediaId: unknown,
  position: unknown,
  duration: unknown
): Promise<void> {
  const userId = await requireUserId();
  const id = requireMediaId(mediaId);
  const progress = parseProgress(position, duration);
  if (!progress) throw new Error("Invalid progress");
  await db.watchHistory.updateMany({
    where: { userId, mediaId: id },
    data: { progressSeconds: progress.position, durationSeconds: progress.duration },
  });
}

/** Takes a title off Continue Watching, or puts it back (Undo). It stays in History. */
export async function setHiddenFromContinue(mediaId: unknown, hidden: unknown): Promise<void> {
  const userId = await requireUserId();
  const id = requireMediaId(mediaId);
  if (typeof hidden !== "boolean") throw new Error("Invalid setting");
  await db.watchHistory.updateMany({ where: { userId, mediaId: id }, data: { hiddenFromContinue: hidden } });
}

/**
 * Moves history recorded while logged out (kept in this browser) into
 * the account, keeping whichever watch time is newer.
 */
export async function importHistory(values: unknown): Promise<void> {
  const userId = await requireUserId();
  if (!Array.isArray(values)) throw new Error("Invalid history");
  for (const value of values.slice(0, HISTORY_LIMIT)) {
    const entry = parseEntry(value);
    const watchedAt = new Date((value as { watchedAt?: unknown })?.watchedAt as string);
    if (!entry || Number.isNaN(watchedAt.getTime()) || watchedAt > new Date()) continue;
    const existing = await db.watchHistory.findUnique({
      where: { userId_mediaId: { userId, mediaId: entry.id } },
      select: { watchedAt: true },
    });
    if (existing && existing.watchedAt >= watchedAt) continue;
    await db.watchHistory.upsert({
      where: { userId_mediaId: { userId, mediaId: entry.id } },
      create: { userId, mediaId: entry.id, entry, watchedAt },
      update: { entry, watchedAt },
    });
  }
  await trimHistory(userId);
}

async function trimHistory(userId: string) {
  const overflow = await db.watchHistory.findMany({
    where: { userId },
    orderBy: { watchedAt: "desc" },
    skip: HISTORY_LIMIT,
    select: { mediaId: true },
  });
  if (overflow.length > 0) {
    await db.watchHistory.deleteMany({
      where: { userId, mediaId: { in: overflow.map((row) => row.mediaId) } },
    });
  }
}

export async function removeFromHistory(mediaId: unknown): Promise<void> {
  const userId = await requireUserId();
  await db.watchHistory.deleteMany({ where: { userId, mediaId: requireMediaId(mediaId) } });
}

export async function clearHistory(): Promise<void> {
  const userId = await requireUserId();
  await db.watchHistory.deleteMany({ where: { userId } });
}

// --- Lists -------------------------------------------------------------

export async function createList(id: unknown, name: unknown, firstItem?: unknown): Promise<void> {
  const userId = await requireUserId();
  if (typeof id !== "string" || !LIST_ID.test(id)) throw new Error("Invalid list");
  const entry = firstItem === undefined ? null : requireEntry(firstItem);
  if ((await db.mediaList.count({ where: { userId } })) >= MAX_LISTS) {
    throw new Error("Too many lists");
  }
  await db.mediaList.create({
    data: {
      id,
      userId,
      name: cleanListName(name),
      items: entry ? { create: { mediaId: entry.id, entry } } : undefined,
    },
  });
}

export async function deleteList(listId: unknown): Promise<void> {
  const userId = await requireUserId();
  await db.mediaList.delete({ where: { id: await requireOwnList(userId, listId) } });
}

export async function renameList(listId: unknown, name: unknown): Promise<void> {
  const userId = await requireUserId();
  await db.mediaList.update({
    where: { id: await requireOwnList(userId, listId) },
    data: { name: cleanListName(name) },
  });
}

/** Shares a list with anyone who has its link, or makes it private again. */
export async function setListPublic(listId: unknown, isPublic: unknown): Promise<void> {
  const userId = await requireUserId();
  if (typeof isPublic !== "boolean") throw new Error("Invalid setting");
  await db.mediaList.update({ where: { id: await requireOwnList(userId, listId) }, data: { isPublic } });
}

export async function addToList(listId: unknown, value: unknown): Promise<void> {
  const userId = await requireUserId();
  const id = await requireOwnList(userId, listId);
  const entry = requireEntry(value);
  if ((await db.listItem.count({ where: { listId: id } })) >= MAX_LIST_ITEMS) {
    throw new Error("List is full");
  }
  await db.listItem.upsert({
    where: { listId_mediaId: { listId: id, mediaId: entry.id } },
    create: { listId: id, mediaId: entry.id, entry },
    update: {},
  });
}

export async function removeFromList(listId: unknown, mediaId: unknown): Promise<void> {
  const userId = await requireUserId();
  const id = await requireOwnList(userId, listId);
  await db.listItem.deleteMany({ where: { listId: id, mediaId: requireMediaId(mediaId) } });
}
