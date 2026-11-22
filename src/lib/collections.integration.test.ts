import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection, DB, Media } from "@/lib/db-types";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  moveCollection,
  addToCollection,
  removeFromCollection,
  moveInCollection,
} from "@/lib/admin-collection-actions";
import {
  getCollection,
  getCollectionForEdit,
  listCollectionIds,
  listCollections,
  listCollectionsForAdmin,
  listHomeCollections,
  searchTitlesForCollection,
} from "@/lib/catalog";
import { withRollback } from "@/test/database";

let mockAdminSession: { user: { id: string; email: string; role?: string | null } } | null = {
  user: { id: "admin-1", email: "admin@gayflix.test", role: "admin" },
};
let mockAdminAllowed = true;

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => mockAdminSession),
  requireAdmin: vi.fn(async () => mockAdminSession?.user),
}));

vi.mock("@/lib/admin-guard", () => ({
  catalogSession: vi.fn(async () => ({
    session: mockAdminSession,
    allowed: mockAdminAllowed,
  })),
  FORBIDDEN_CATALOG: "You do not have catalog permission.",
}));

vi.mock("@/lib/admin-flash", () => ({
  setAdminFlash: vi.fn(async () => {}),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

async function createTestMedia(
  executor: Kysely<DB>,
  id = `media-${randomUUID().slice(0, 8)}`,
  overrides: Partial<Insertable<Media>> = {}
): Promise<string> {
  await executor
    .insertInto("media")
    .values({
      id,
      title: `Test Media ${id}`,
      type: "movie",
      year: 2024,
      duration: "1h 30m",
      country: "US",
      language: "en",
      posterUrl: "/posters/test.jpg",
      status: "published",
      ...overrides,
    })
    .execute();
  return id;
}

async function createTestCollection(
  executor: Kysely<DB>,
  id = `col-${randomUUID().slice(0, 8)}`,
  overrides: Partial<Insertable<Collection>> = {}
): Promise<string> {
  await executor
    .insertInto("collection")
    .values({
      id,
      title: `Collection ${id}`,
      description: `Description for ${id}`,
      published: true,
      onHome: false,
      position: 0,
      ...overrides,
    })
    .execute();
  return id;
}

async function addTestItem(
  executor: Kysely<DB>,
  collectionId: string,
  mediaId: string,
  position = 0
) {
  await executor
    .insertInto("collection_item")
    .values({
      collectionId,
      mediaId,
      position,
    })
    .execute();
}

function makeFormData(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    form.append(key, val);
  }
  return form;
}

describe("Collections Kysely integration", () => {
  beforeEach(() => {
    mockAdminSession = {
      user: { id: "admin-1", email: "admin@gayflix.test", role: "admin" },
    };
    mockAdminAllowed = true;
  });

  describe("Public Collection Reads", () => {
    it("an unpublished or out-of-date collection isn't listed", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);

        // 1. Active published collection with published media -> listed
        const activeId = `active-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, activeId, {
          title: "Active Collection",
          published: true,
          startsAt: null,
          endsAt: null,
        });
        await addTestItem(trx, activeId, mediaId, 0);

        const listAfterActive = await listCollections(trx);
        const activeCard = await getCollection(activeId, trx);
        expect(listAfterActive.some((c) => c.id === activeId)).toBe(true);
        expect(activeCard).not.toBeNull();
        expect(activeCard?.id).toBe(activeId);
        expect(activeCard?.media.length).toBe(1);
        expect(activeCard?.media[0].id).toBe(mediaId);

        // 2. Unpublished collection (published = false) -> not listed, getCollection returns null
        const unpubId = `unpub-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, unpubId, {
          title: "Unpublished Collection",
          published: false,
        });
        await addTestItem(trx, unpubId, mediaId, 0);

        const listWithUnpub = await listCollections(trx);
        expect(listWithUnpub.some((c) => c.id === unpubId)).toBe(false);
        expect(await getCollection(unpubId, trx)).toBeNull();

        // 3. Out-of-date collection: endsAt in past -> not listed, getCollection returns null
        const pastDate = new Date(Date.now() - 5 * 86_400_000);
        const endedId = `ended-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, endedId, {
          title: "Ended Collection",
          published: true,
          endsAt: pastDate,
        });
        await addTestItem(trx, endedId, mediaId, 0);

        const listWithEnded = await listCollections(trx);
        expect(listWithEnded.some((c) => c.id === endedId)).toBe(false);
        expect(await getCollection(endedId, trx)).toBeNull();

        // 4. Out-of-date collection: startsAt in future -> not listed, getCollection returns null
        const futureDate = new Date(Date.now() + 5 * 86_400_000);
        const upcomingId = `upcoming-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, upcomingId, {
          title: "Upcoming Collection",
          published: true,
          startsAt: futureDate,
        });
        await addTestItem(trx, upcomingId, mediaId, 0);

        const listWithUpcoming = await listCollections(trx);
        expect(listWithUpcoming.some((c) => c.id === upcomingId)).toBe(false);
        expect(await getCollection(upcomingId, trx)).toBeNull();

        // 5. Active date window: startsAt in past, endsAt in future -> listed
        const windowId = `window-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, windowId, {
          title: "Windowed Collection",
          published: true,
          startsAt: pastDate,
          endsAt: futureDate,
        });
        await addTestItem(trx, windowId, mediaId, 0);

        const listWithWindow = await listCollections(trx);
        expect(listWithWindow.some((c) => c.id === windowId)).toBe(true);
        expect(await getCollection(windowId, trx)).not.toBeNull();

        // 6. Collection with no published media -> not listed
        const emptyId = `empty-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, emptyId, {
          title: "Empty Collection",
          published: true,
        });
        expect((await listCollections(trx)).some((c) => c.id === emptyId)).toBe(false);
        expect(await getCollection(emptyId, trx)).toBeNull();

        // 7. Collection with only draft or trashed media -> not listed
        const draftMediaId = await createTestMedia(trx, undefined, { status: "draft" });
        const trashedMediaId = await createTestMedia(trx, undefined, {
          status: "published",
          trashedAt: new Date(),
        });
        const unpubMediaColId = `unpub-media-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, unpubMediaColId, {
          title: "Collection With Draft Media",
          published: true,
        });
        await addTestItem(trx, unpubMediaColId, draftMediaId, 0);
        await addTestItem(trx, unpubMediaColId, trashedMediaId, 1);
        expect((await listCollections(trx)).some((c) => c.id === unpubMediaColId)).toBe(false);
        expect(await getCollection(unpubMediaColId, trx)).toBeNull();
      });
    });

    it("listHomeCollections returns only showing collections marked for home", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);

        const homeId = `home-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, homeId, {
          title: "Home Row Collection",
          published: true,
          onHome: true,
        });
        await addTestItem(trx, homeId, mediaId, 0);

        const notHomeId = `nothome-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, notHomeId, {
          title: "Not Home Collection",
          published: true,
          onHome: false,
        });
        await addTestItem(trx, notHomeId, mediaId, 0);

        const homeCollections = await listHomeCollections(trx);
        expect(homeCollections.some((c) => c.id === homeId)).toBe(true);
        expect(homeCollections.some((c) => c.id === notHomeId)).toBe(false);

        const ids = await listCollectionIds(trx);
        expect(ids.includes(homeId)).toBe(true);
        expect(ids.includes(notHomeId)).toBe(true);
      });
    });
  });

  describe("Admin Collection Reads", () => {
    it("listCollectionsForAdmin includes all collections and item counts", async () => {
      await withRollback(async (trx) => {
        const media1 = await createTestMedia(trx);
        const media2 = await createTestMedia(trx);

        const colId = `admin-col-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, colId, {
          title: "Admin Test Collection",
          published: false,
        });
        await addTestItem(trx, colId, media1, 0);
        await addTestItem(trx, colId, media2, 1);

        const list = await listCollectionsForAdmin(trx);
        const found = list.find((c) => c.id === colId);
        expect(found).toBeDefined();
        expect(found?._count.items).toBe(2);
        expect(found?.itemCount).toBe(2);
      });
    });

    it("getCollectionForEdit returns collection and items including drafts and trashed titles", async () => {
      await withRollback(async (trx) => {
        const pubMedia = await createTestMedia(trx, undefined, { status: "published" });
        const draftMedia = await createTestMedia(trx, undefined, { status: "draft" });
        const trashedMedia = await createTestMedia(trx, undefined, {
          status: "published",
          trashedAt: new Date(),
        });

        const colId = `edit-col-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, colId, { title: "Edit Col" });
        await addTestItem(trx, colId, pubMedia, 0);
        await addTestItem(trx, colId, draftMedia, 1);
        await addTestItem(trx, colId, trashedMedia, 2);

        const col = await getCollectionForEdit(colId, trx);
        expect(col).not.toBeNull();
        expect(col?.id).toBe(colId);
        expect(col?.items.length).toBe(3);
        expect(col?.items[0].media.id).toBe(pubMedia);
        expect(col?.items[0].media.status).toBe("published");
        expect(col?.items[1].media.id).toBe(draftMedia);
        expect(col?.items[1].media.status).toBe("draft");
        expect(col?.items[2].media.id).toBe(trashedMedia);
        expect(col?.items[2].media.trashedAt).not.toBeNull();

        // Non-existent or invalid id
        expect(await getCollectionForEdit("non-existent-id", trx)).toBeNull();
        expect(await getCollectionForEdit("invalid/id!", trx)).toBeNull();
      });
    });

    it("searchTitlesForCollection searches non-trashed titles by query", async () => {
      await withRollback(async (trx) => {
        const unique = randomUUID().slice(0, 6);
        const matchingId = await createTestMedia(trx, undefined, {
          title: `Rainbow Feature ${unique}`,
          year: 2021,
        });
        const matchingOlderId = await createTestMedia(trx, undefined, {
          title: `Rainbow Classic ${unique}`,
          year: 1999,
        });
        const trashedId = await createTestMedia(trx, undefined, {
          title: `Rainbow Trash ${unique}`,
          trashedAt: new Date(),
        });

        const results = await searchTitlesForCollection(unique, trx);
        expect(results.length).toBe(2);
        expect(results.map((r) => r.id)).toContain(matchingId);
        expect(results.map((r) => r.id)).toContain(matchingOlderId);
        expect(results.map((r) => r.id)).not.toContain(trashedId);

        // Empty query
        expect(await searchTitlesForCollection("   ", trx)).toEqual([]);
      });
    });
  });

  describe("Admin Collection Actions", () => {
    it("createCollection creates new collection and prevents duplicate slugs", async () => {
      await withRollback(async (trx) => {
        const form = makeFormData({
          id: `new-slug-${randomUUID().slice(0, 6)}`,
          title: "New Amazing Collection",
          description: "All the best titles",
          published: "on",
          onHome: "on",
          startsAt: "2026-06-01",
          endsAt: "2026-06-30",
        });

        // Redirect is thrown on success
        await expect(createCollection({}, form, trx)).rejects.toThrow("REDIRECT:/admin/collections/");

        // Attempting to create duplicate slug
        const res = await createCollection({}, form, trx);
        expect(res.errors?.id).toBe("Another collection has that address.");
      });
    });

    it("updateCollection updates collection fields and returns ok", async () => {
      await withRollback(async (trx) => {
        const colId = `update-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, colId, { title: "Old Title" });

        const form = makeFormData({
          title: "Updated Title",
          description: "Updated Description",
          published: "on",
        });

        const res = await updateCollection(colId, {}, form, trx);
        expect(res.ok).toBe(true);

        const updated = await trx
          .selectFrom("collection")
          .select(["title", "description", "published"])
          .where("id", "=", colId)
          .executeTakeFirst();
        expect(updated?.title).toBe("Updated Title");
        expect(updated?.description).toBe("Updated Description");
        expect(updated?.published).toBe(true);
      });
    });

    it("deleteCollection deletes collection", async () => {
      await withRollback(async (trx) => {
        const colId = `delete-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, colId, { title: "To Be Deleted" });

        await expect(deleteCollection(colId, trx)).rejects.toThrow("REDIRECT:/admin/collections");

        const found = await trx
          .selectFrom("collection")
          .select("id")
          .where("id", "=", colId)
          .executeTakeFirst();
        expect(found).toBeUndefined();
      });
    });

    it("moveCollection reorders collections up and down", async () => {
      await withRollback(async (trx) => {
        const id1 = `move1-${randomUUID().slice(0, 6)}`;
        const id2 = `move2-${randomUUID().slice(0, 6)}`;
        await createTestCollection(trx, id1, { position: 0 });
        await createTestCollection(trx, id2, { position: 1 });

        // Move id2 up
        await moveCollection(id2, "up", trx);

        const rowsAfterUp = await trx
          .selectFrom("collection")
          .select(["id", "position"])
          .where("id", "in", [id1, id2])
          .execute();
        const pos1 = rowsAfterUp.find((r) => r.id === id1)!.position;
        const pos2 = rowsAfterUp.find((r) => r.id === id2)!.position;
        expect(pos2).toBeLessThan(pos1);

        // Move id2 back down
        await moveCollection(id2, "down", trx);
        const rowsAfterDown = await trx
          .selectFrom("collection")
          .select(["id", "position"])
          .where("id", "in", [id1, id2])
          .execute();
        const pos1Down = rowsAfterDown.find((r) => r.id === id1)!.position;
        const pos2Down = rowsAfterDown.find((r) => r.id === id2)!.position;
        expect(pos2Down).toBeGreaterThan(pos1Down);
      });
    });

    it("addToCollection, removeFromCollection, and moveInCollection manage collection items", async () => {
      await withRollback(async (trx) => {
        const colId = `items-col-${randomUUID().slice(0, 8)}`;
        await createTestCollection(trx, colId);

        const media1 = await createTestMedia(trx);
        const media2 = await createTestMedia(trx);

        // Add media1
        await addToCollection(colId, media1, trx);
        let items = await trx
          .selectFrom("collection_item")
          .select(["mediaId", "position"])
          .where("collectionId", "=", colId)
          .orderBy("position", "asc")
          .execute();
        expect(items.length).toBe(1);
        expect(items[0].mediaId).toBe(media1);

        // Duplicate add is idempotent
        await addToCollection(colId, media1, trx);
        items = await trx
          .selectFrom("collection_item")
          .select(["mediaId", "position"])
          .where("collectionId", "=", colId)
          .execute();
        expect(items.length).toBe(1);

        // Add media2
        await addToCollection(colId, media2, trx);
        items = await trx
          .selectFrom("collection_item")
          .select(["mediaId", "position"])
          .where("collectionId", "=", colId)
          .orderBy("position", "asc")
          .execute();
        expect(items.length).toBe(2);
        expect(items[0].mediaId).toBe(media1);
        expect(items[1].mediaId).toBe(media2);

        // Adding non-existent media does not throw unhandled exception (foreign key violation ignored)
        await expect(addToCollection(colId, "non-existent-media", trx)).resolves.not.toThrow();

        // Move media2 up
        await moveInCollection(colId, media2, "up", trx);
        items = await trx
          .selectFrom("collection_item")
          .select(["mediaId", "position"])
          .where("collectionId", "=", colId)
          .orderBy("position", "asc")
          .execute();
        expect(items[0].mediaId).toBe(media2);
        expect(items[1].mediaId).toBe(media1);

        // Move media2 down
        await moveInCollection(colId, media2, "down", trx);
        items = await trx
          .selectFrom("collection_item")
          .select(["mediaId", "position"])
          .where("collectionId", "=", colId)
          .orderBy("position", "asc")
          .execute();
        expect(items[0].mediaId).toBe(media1);
        expect(items[1].mediaId).toBe(media2);

        // Remove media1
        await removeFromCollection(colId, media1, trx);
        items = await trx
          .selectFrom("collection_item")
          .select(["mediaId", "position"])
          .where("collectionId", "=", colId)
          .execute();
        expect(items.length).toBe(1);
        expect(items[0].mediaId).toBe(media2);
      });
    });
  });
});
