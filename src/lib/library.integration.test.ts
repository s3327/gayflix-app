import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/lib/db-types";
import {
  findList,
  getResumePosition,
  HISTORY_LIMIT,
  loadLibrary,
  trimHistory,
} from "@/lib/library";
import {
  addToList,
  clearHistory,
  createList,
  deleteList,
  importHistory,
  recordWatch,
  removeFromHistory,
  removeFromList,
  renameList,
  saveProgress,
  setFavorite,
  setHiddenFromContinue,
  setListPublic,
  setWatchlist,
} from "@/lib/library-actions";
import type { FavoriteEntry } from "@/lib/library-types";
import { withRollback } from "@/test/database";

let mockUserId: string | null = null;

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => (mockUserId ? { user: { id: mockUserId } } : null)),
}));

vi.mock("@/lib/catalog", () => ({
  findPublishedIds: vi.fn(async (ids: string[]) => new Set(ids)),
}));

function makeEntry(id: string, title = `Title ${id}`): FavoriteEntry {
  return {
    id,
    title,
    year: 2024,
    duration: "1h 30m",
    type: "movie",
    genre: "Drama",
  };
}

async function createTestUser(
  executor: Kysely<DB>,
  email = `test-${randomUUID()}@gayflix.test`
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at)
    VALUES (${id}::uuid, ${email}, ${JSON.stringify({})}::jsonb, now(), now())
  `.execute(executor);
  return id;
}

describe("Library Kysely integration", () => {
  beforeEach(() => {
    mockUserId = null;
  });

  describe("saveProgress", () => {
    it("updates only the caller's row", async () => {
      await withRollback(async (trx) => {
        const userA = await createTestUser(trx);
        const userB = await createTestUser(trx);
        const mediaId = `movie-${randomUUID().slice(0, 8)}`;
        const entry = makeEntry(mediaId);

        await trx
          .insertInto("watch_history")
          .values([
            {
              userId: userA,
              mediaId,
              entry: JSON.stringify(entry),
              progressSeconds: 0,
              durationSeconds: 1000,
            },
            {
              userId: userB,
              mediaId,
              entry: JSON.stringify(entry),
              progressSeconds: 0,
              durationSeconds: 1000,
            },
          ])
          .execute();

        mockUserId = userA;
        await saveProgress(mediaId, 350, 1000, trx);

        const rowA = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userA)
          .where("mediaId", "=", mediaId)
          .executeTakeFirstOrThrow();
        const rowB = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userB)
          .where("mediaId", "=", mediaId)
          .executeTakeFirstOrThrow();

        expect(rowA.progressSeconds).toBe(350);
        expect(rowA.durationSeconds).toBe(1000);
        expect(rowB.progressSeconds).toBe(0);
        expect(rowB.durationSeconds).toBe(1000);
      });
    });

    it("rejects invalid progress or unauthenticated calls", async () => {
      await withRollback(async (trx) => {
        mockUserId = null;
        await expect(saveProgress("movie-1", 100, 200, trx)).rejects.toThrow("Not signed in");

        mockUserId = await createTestUser(trx);
        await expect(saveProgress("movie-1", "invalid", 200, trx)).rejects.toThrow("Invalid progress");
      });
    });
  });

  describe("trimHistory", () => {
    it("keeps the newest HISTORY_LIMIT", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const total = HISTORY_LIMIT + 15;
        const baseDate = new Date("2026-01-01T00:00:00Z");

        const rows = Array.from({ length: total }, (_, i) => {
          const mediaId = `media-${i}`;
          const watchedAt = new Date(baseDate.getTime() + i * 1000);
          return {
            userId,
            mediaId,
            entry: JSON.stringify(makeEntry(mediaId)),
            watchedAt,
          };
        });

        await trx.insertInto("watch_history").values(rows).execute();

        const before = await trx
          .selectFrom("watch_history")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("userId", "=", userId)
          .executeTakeFirstOrThrow();
        expect(Number(before.count)).toBe(total);

        await trimHistory(userId, trx);

        const after = await trx
          .selectFrom("watch_history")
          .select(["mediaId", "watchedAt"])
          .where("userId", "=", userId)
          .orderBy("watchedAt", "desc")
          .execute();

        expect(after.length).toBe(HISTORY_LIMIT);
        expect(after[0].mediaId).toBe(`media-${total - 1}`);
        expect(after[after.length - 1].mediaId).toBe("media-15");

        const removed = await trx
          .selectFrom("watch_history")
          .select("mediaId")
          .where("userId", "=", userId)
          .where("mediaId", "in", ["media-0", "media-1", "media-14"])
          .execute();
        expect(removed).toEqual([]);
      });
    });

    it("does nothing when history count is within limit", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const entry = makeEntry("media-1");
        await trx
          .insertInto("watch_history")
          .values({ userId, mediaId: entry.id, entry: JSON.stringify(entry) })
          .execute();

        await trimHistory(userId, trx);

        const remaining = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .execute();
        expect(remaining.length).toBe(1);
      });
    });
  });

  describe("Favorites and Watchlist", () => {
    it("setFavorite adds, updates on duplicate, and deletes", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;
        const entry = makeEntry("fav-1", "Favorite 1");

        await setFavorite(entry, true, trx);
        let favs = await trx.selectFrom("favorite").selectAll().where("userId", "=", userId).execute();
        expect(favs.length).toBe(1);
        expect(favs[0].mediaId).toBe("fav-1");

        // Re-adding (upsert) updates entry
        const updatedEntry = { ...entry, title: "Favorite 1 Updated" };
        await setFavorite(updatedEntry, true, trx);
        favs = await trx.selectFrom("favorite").selectAll().where("userId", "=", userId).execute();
        expect(favs.length).toBe(1);

        // Turn off deletes
        await setFavorite(entry, false, trx);
        favs = await trx.selectFrom("favorite").selectAll().where("userId", "=", userId).execute();
        expect(favs.length).toBe(0);
      });
    });

    it("setWatchlist adds, updates on duplicate, and deletes", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;
        const entry = makeEntry("watch-1");

        await setWatchlist(entry, true, trx);
        let items = await trx.selectFrom("watchlist_item").selectAll().where("userId", "=", userId).execute();
        expect(items.length).toBe(1);
        expect(items[0].mediaId).toBe("watch-1");

        // Turn off
        await setWatchlist(entry, false, trx);
        items = await trx.selectFrom("watchlist_item").selectAll().where("userId", "=", userId).execute();
        expect(items.length).toBe(0);
      });
    });
  });

  describe("Watch history and continue watching", () => {
    it("recordWatch inserts history, unhides, and setHiddenFromContinue toggles", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;
        const entry = makeEntry("rec-1");

        await recordWatch(entry, trx);
        let row = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", "rec-1")
          .executeTakeFirstOrThrow();
        expect(row.hiddenFromContinue).toBe(false);

        // Hide it
        await setHiddenFromContinue("rec-1", true, trx);
        row = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", "rec-1")
          .executeTakeFirstOrThrow();
        expect(row.hiddenFromContinue).toBe(true);

        // Recording watch again unhides it
        await recordWatch(entry, trx);
        row = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", "rec-1")
          .executeTakeFirstOrThrow();
        expect(row.hiddenFromContinue).toBe(false);

        // Resume position
        await saveProgress("rec-1", 120, 600, trx);
        const resume = await getResumePosition("rec-1", trx);
        expect(resume).toBe(120);

        // Remove from history
        await removeFromHistory("rec-1", trx);
        const countAfterRemove = await trx
          .selectFrom("watch_history")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("userId", "=", userId)
          .executeTakeFirstOrThrow();
        expect(Number(countAfterRemove.count)).toBe(0);
      });
    });

    it("clearHistory deletes all history rows for the user", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;
        await recordWatch(makeEntry("h1"), trx);
        await recordWatch(makeEntry("h2"), trx);

        await clearHistory(trx);
        const rows = await trx.selectFrom("watch_history").where("userId", "=", userId).execute();
        expect(rows.length).toBe(0);
      });
    });

    it("importHistory merges newer items and ignores older ones", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;
        const entry = makeEntry("imp-1");
        const older = new Date("2026-01-01T00:00:00Z");
        const newer = new Date("2026-01-02T00:00:00Z");

        // Seed existing newer watch
        await trx
          .insertInto("watch_history")
          .values({ userId, mediaId: entry.id, entry: JSON.stringify(entry), watchedAt: newer })
          .execute();

        const initial = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", entry.id)
          .executeTakeFirstOrThrow();

        // Import older watch -> should keep existing
        await importHistory([{ ...entry, watchedAt: older.toISOString() }], trx);
        let row = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", entry.id)
          .executeTakeFirstOrThrow();
        expect(row.watchedAt).toEqual(initial.watchedAt);

        // Import newer watch -> should update
        const newest = new Date("2026-01-03T00:00:00Z");
        await importHistory([{ ...entry, watchedAt: newest.toISOString() }], trx);
        row = await trx
          .selectFrom("watch_history")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", entry.id)
          .executeTakeFirstOrThrow();
        expect(new Date(row.watchedAt).getTime()).toBeGreaterThan(new Date(initial.watchedAt).getTime());
      });
    });
  });

  describe("Lists", () => {
    it("manages lists: create, rename, set public, add/remove items, delete", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;
        const listId = randomUUID();
        const first = makeEntry("item-1");

        // Create with first item
        await createList(listId, "My Favorites List", first, trx);
        let list = await findList(listId, trx);
        expect(list).not.toBeNull();
        expect(list?.ownerId).toBe(userId);
        expect(list?.list.name).toBe("My Favorites List");
        expect(list?.list.items.length).toBe(1);
        expect(list?.list.items[0].id).toBe("item-1");

        // Add second item
        const second = makeEntry("item-2");
        await addToList(listId, second, trx);
        list = await findList(listId, trx);
        expect(list?.list.items.length).toBe(2);

        // Duplicate add is ignored (doNothing)
        await addToList(listId, second, trx);
        list = await findList(listId, trx);
        expect(list?.list.items.length).toBe(2);

        // Rename list
        await renameList(listId, "Renamed List", trx);
        list = await findList(listId, trx);
        expect(list?.list.name).toBe("Renamed List");

        // Set public
        await setListPublic(listId, true, trx);
        list = await findList(listId, trx);
        expect(list?.list.isPublic).toBe(true);

        // Set private (also removes inCommunity)
        await setListPublic(listId, false, trx);
        list = await findList(listId, trx);
        expect(list?.list.isPublic).toBe(false);
        expect(list?.list.inCommunity).toBe(false);

        // Remove item
        await removeFromList(listId, "item-1", trx);
        list = await findList(listId, trx);
        expect(list?.list.items.length).toBe(1);
        expect(list?.list.items[0].id).toBe("item-2");

        // Delete list cascades
        await deleteList(listId, trx);
        const deleted = await findList(listId, trx);
        expect(deleted).toBeNull();
        const orphanItems = await trx.selectFrom("list_item").where("listId", "=", listId).execute();
        expect(orphanItems.length).toBe(0);
      });
    });
  });

  describe("loadLibrary", () => {
    it("loads complete library shape for a user", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockUserId = userId;

        const fav = makeEntry("f1");
        const watch = makeEntry("w1");
        const hist = makeEntry("h1");
        const listId = randomUUID();
        const listItem = makeEntry("l1");

        await setFavorite(fav, true, trx);
        await setWatchlist(watch, true, trx);
        await recordWatch(hist, trx);
        await createList(listId, "List 1", listItem, trx);

        await trx
          .insertInto("media")
          .values({
            id: "f1",
            title: "Test Media",
            type: "movie",
            year: 2024,
            duration: "1h 30m",
            country: "US",
            language: "en",
            posterUrl: "/posters/test.jpg",
          })
          .execute();

        await trx
          .insertInto("media_rating")
          .values({ userId, mediaId: "f1", value: "love" })
          .execute();

        const lib = await loadLibrary(userId, trx);
        expect(lib.favorites["f1"]).toBeDefined();
        expect(lib.favorites["f1"].title).toBe(fav.title);
        expect(lib.watchlist["w1"]).toBeDefined();
        expect(lib.history["h1"]).toBeDefined();
        expect(lib.history["h1"].watchedAt).toBeDefined();
        expect(lib.lists[listId]).toBeDefined();
        expect(lib.lists[listId].items.length).toBe(1);
        expect(lib.lists[listId].items[0].id).toBe("l1");
        expect(lib.ratings["f1"]).toBe("love");
      });
    });
  });
});
