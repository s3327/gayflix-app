import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import { sql } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { database } from "@/lib/database";
import type { DB, Episode, Media } from "./db-types";
import {
  bulkDeleteForGoodTrash,
  bulkRestoreTrash,
  bulkTagTitles,
  createEpisode,
  deleteEpisode,
  deleteTitle,
  quickUpdateTitle,
  restoreTitle,
  saveSeasonEpisodesAction,
  trashTitle,
  updateEpisode,
  updateMediaStatusBatch,
  updateTitle,
} from "./admin-catalog-actions";
import { NO_POSTER, type TitleInput } from "./title-form";
import { insertTitle, unfeatureOthers } from "./title-store";
import { withRollback } from "@/test/database";

let mockAdminSession: { user: { id: string; email: string; role?: string | null } } | null = {
  user: { id: randomUUID(), email: "admin@gayflix.test", role: "admin" },
};
let mockAdminAllowed = true;

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => mockAdminSession),
  requireAdmin: vi.fn(async () => mockAdminSession),
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

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

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
      posterUrl: NO_POSTER,
      status: "published",
      genres: ["Drama"],
      cast: ["Actor A"],
      tags: ["tag1"],
      ...overrides,
    })
    .execute();
  return id;
}

async function createTestEpisode(
  executor: Kysely<DB>,
  mediaId: string,
  id = `ep-${randomUUID().slice(0, 8)}`,
  overrides: Partial<Insertable<Episode>> = {}
): Promise<string> {
  await executor
    .insertInto("episode")
    .values({
      id,
      mediaId,
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Episode 1",
      duration: "45 min",
      ...overrides,
    })
    .execute();
  return id;
}

const sampleMovieInput: TitleInput = {
  title: "Weekend Lovers",
  status: "published",
  featured: false,
  year: 2024,
  releaseDate: new Date("2024-01-01"),
  runtimeMinutes: 95,
  genres: ["Drama", "Romance"],
  country: "United Kingdom",
  language: "English",
  synopsis: "Two men meet in London and spend a weekend together.",
  tagline: "A weekend to remember.",
  rating: 8.2,
  credit: "Director Name",
  cast: ["Actor 1", "Actor 2"],
  tags: ["indie", "romance"],
  posterUrl: "https://example.com/poster.jpg",
  backdropUrl: null,
  trailerUrl: null,
  maturityRating: "18",
  contentNotes: [],
  publishAt: null,
};

describe("admin catalog integration", () => {
  beforeEach(() => {
    mockAdminSession = {
      user: { id: randomUUID(), email: "admin@gayflix.test", role: "admin" },
    };
    mockAdminAllowed = true;
  });

  describe("all-or-nothing transactions", () => {
    it("creating a title with episodes is all-or-nothing (a failing episode leaves no media row)", async () => {
      const failedTitleId = `series-fail-${randomUUID().slice(0, 8)}`;

      // Failure case: episode insertion fails (duplicate ID constraint), so media row must not persist
      await expect(
        database.transaction().execute(async (tx) => {
          await tx
            .insertInto("media")
            .values({
              id: failedTitleId,
              title: "Series Rollback Test",
              type: "series",
              year: 2024,
              duration: "",
              country: "US",
              language: "en",
              posterUrl: NO_POSTER,
              status: "published",
            })
            .execute();

          await tx
            .insertInto("episode")
            .values({
              id: `${failedTitleId}-ep-1`,
              mediaId: failedTitleId,
              seasonNumber: 1,
              episodeNumber: 1,
              title: "Episode 1",
              duration: "45 min",
            })
            .execute();

          // Deliberately trigger unique constraint violation on episode id
          await tx
            .insertInto("episode")
            .values({
              id: `${failedTitleId}-ep-1`,
              mediaId: failedTitleId,
              seasonNumber: 1,
              episodeNumber: 2,
              title: "Episode 2",
              duration: "45 min",
            })
            .execute();
        })
      ).rejects.toThrow();

      // Verify no media row was created
      const mediaRow = await database
        .selectFrom("media")
        .select("id")
        .where("id", "=", failedTitleId)
        .executeTakeFirst();
      expect(mediaRow).toBeUndefined();

      // Verify no episode row was created
      const episodeRows = await database
        .selectFrom("episode")
        .select("id")
        .where("mediaId", "=", failedTitleId)
        .execute();
      expect(episodeRows.length).toBe(0);

      // Success case: both media and episodes are created
      await withRollback(async (trx) => {
        const successTitleId = `series-succ-${randomUUID().slice(0, 8)}`;
        await trx
          .insertInto("media")
          .values({
            id: successTitleId,
            title: "Successful Series",
            type: "series",
            year: 2024,
            duration: "1 Season",
            country: "US",
            language: "en",
            posterUrl: NO_POSTER,
            status: "published",
          })
          .execute();

        await trx
          .insertInto("episode")
          .values({
            id: `${successTitleId}-ep-1`,
            mediaId: successTitleId,
            seasonNumber: 1,
            episodeNumber: 1,
            title: "Episode 1",
            duration: "45 min",
          })
          .execute();

        const createdMedia = await trx
          .selectFrom("media")
          .select(["id", "title"])
          .where("id", "=", successTitleId)
          .executeTakeFirst();
        expect(createdMedia).toBeDefined();
        expect(createdMedia?.id).toBe(successTitleId);

        const createdEps = await trx
          .selectFrom("episode")
          .select(["id", "mediaId"])
          .where("mediaId", "=", successTitleId)
          .execute();
        expect(createdEps.length).toBe(1);
        expect(createdEps[0].id).toBe(`${successTitleId}-ep-1`);
      });
    });
  });

  describe("titleStore insertTitle & unfeatureOthers", () => {
    it("inserts a movie with default embed video source and unfeatures other titles", async () => {
      await withRollback(async (trx) => {
        // Create an existing featured title
        const existingFeaturedId = await createTestMedia(trx, undefined, { featured: true });

        const insertedId = await insertTitle(
          "movie",
          { ...sampleMovieInput, featured: true },
          { imdbId: "tt9988776" },
          trx
        );

        expect(insertedId).toBeDefined();

        // The previous title should no longer be featured
        const prevMedia = await trx
          .selectFrom("media")
          .select("featured")
          .where("id", "=", existingFeaturedId)
          .executeTakeFirst();
        expect(prevMedia?.featured).toBe(false);

        // The new title should be featured
        const newMedia = await trx
          .selectFrom("media")
          .select(["featured", "duration", "imdbId"])
          .where("id", "=", insertedId!)
          .executeTakeFirst();
        expect(newMedia?.featured).toBe(true);
        expect(newMedia?.duration).toBe("1h 35m");

        // Movie should have received Server 1 embed source
        const source = await trx
          .selectFrom("video_source")
          .select(["mediaId", "label", "url"])
          .where("mediaId", "=", insertedId!)
          .executeTakeFirst();
        expect(source?.label).toBe("Server 1");
        expect(source?.url).toContain("tt9988776");
      });
    });

    it("inserts a series with empty seasons duration and no video source", async () => {
      await withRollback(async (trx) => {
        const insertedId = await insertTitle(
          "series",
          { ...sampleMovieInput, runtimeMinutes: null, featured: false },
          {},
          trx
        );

        expect(insertedId).toBeDefined();

        const newMedia = await trx
          .selectFrom("media")
          .select(["type", "duration"])
          .where("id", "=", insertedId!)
          .executeTakeFirst();
        expect(newMedia?.type).toBe("series");
        expect(newMedia?.duration).toBe("");

        const sourceCount = await trx
          .selectFrom("video_source")
          .select((eb) => eb.fn.countAll().as("total"))
          .where("mediaId", "=", insertedId!)
          .executeTakeFirst();
        expect(Number(sourceCount?.total ?? 0)).toBe(0);
      });
    });

    it("unfeatureOthers sets featured=false on other titles without touching their updatedAt", async () => {
      await withRollback(async (trx) => {
        const id1 = await createTestMedia(trx, undefined, { featured: true });
        const id2 = await createTestMedia(trx, undefined, { featured: true });

        await unfeatureOthers(trx, id1);

        const row1 = await trx.selectFrom("media").select("featured").where("id", "=", id1).executeTakeFirst();
        const row2 = await trx.selectFrom("media").select("featured").where("id", "=", id2).executeTakeFirst();

        expect(row1?.featured).toBe(true);
        expect(row2?.featured).toBe(false);
      });
    });
  });

  describe("admin actions: status batch, trash, restore, delete", () => {
    it("updateMediaStatusBatch publishes, unpublishes and sets publishedAt", async () => {
      await withRollback(async (trx) => {
        const id1 = await createTestMedia(trx, undefined, { status: "draft", publishedAt: null });
        const id2 = await createTestMedia(trx, undefined, { status: "draft", publishedAt: null });

        // Publish batch
        const publishedIds = await updateMediaStatusBatch([id1, id2], "published", trx);
        expect(publishedIds).toEqual([id1, id2]);

        const rows = await trx
          .selectFrom("media")
          .select(["id", "status", "publishedAt"])
          .where("id", "in", [id1, id2])
          .execute();
        for (const row of rows) {
          expect(row.status).toBe("published");
          expect(row.publishedAt).toBeInstanceOf(Date);
        }

        // Unpublish batch
        const unpublishedIds = await updateMediaStatusBatch([id1], "draft", trx);
        expect(unpublishedIds).toEqual([id1]);

        const row1 = await trx.selectFrom("media").select("status").where("id", "=", id1).executeTakeFirst();
        expect(row1?.status).toBe("draft");
      });
    });

    it("trashTitle and restoreTitle preserve statusBeforeTrash and featuredBeforeTrash", async () => {
      await withRollback(async (trx) => {
        const id = await createTestMedia(trx, undefined, { status: "published", featured: true });

        // Trash title
        await trashTitle(id, trx);

        const trashed = await trx
          .selectFrom("media")
          .select(["status", "featured", "statusBeforeTrash", "featuredBeforeTrash", "trashedAt"])
          .where("id", "=", id)
          .executeTakeFirst();
        expect(trashed?.status).toBe("draft");
        expect(trashed?.featured).toBe(false);
        expect(trashed?.statusBeforeTrash).toBe("published");
        expect(trashed?.featuredBeforeTrash).toBe(true);
        expect(trashed?.trashedAt).toBeInstanceOf(Date);

        // Restore title
        await restoreTitle(id, trx);

        const restored = await trx
          .selectFrom("media")
          .select(["status", "featured", "statusBeforeTrash", "featuredBeforeTrash", "trashedAt"])
          .where("id", "=", id)
          .executeTakeFirst();
        expect(restored?.status).toBe("published");
        expect(restored?.featured).toBe(true);
        expect(restored?.statusBeforeTrash).toBeNull();
        expect(restored?.featuredBeforeTrash).toBeNull();
        expect(restored?.trashedAt).toBeNull();
      });
    });

    it("deleteTitle permanently deletes a trashed title", async () => {
      await withRollback(async (trx) => {
        const id = await createTestMedia(trx, undefined, { trashedAt: new Date(), status: "draft" });

        await deleteTitle(id, trx);

        const deleted = await trx
          .selectFrom("media")
          .select("id")
          .where("id", "=", id)
          .executeTakeFirst();
        expect(deleted).toBeUndefined();
      });
    });

    it("bulkRestoreTrash and bulkDeleteForGoodTrash work across multiple items", async () => {
      await withRollback(async (trx) => {
        const id1 = await createTestMedia(trx, undefined, {
          trashedAt: new Date(),
          status: "draft",
          statusBeforeTrash: "published",
        });
        const id2 = await createTestMedia(trx, undefined, {
          trashedAt: new Date(),
          status: "draft",
          statusBeforeTrash: "draft",
        });

        const form = new FormData();
        form.append("ids", id1);
        form.append("ids", id2);

        await bulkRestoreTrash(form, trx);

        const row1 = await trx.selectFrom("media").select(["status", "trashedAt"]).where("id", "=", id1).executeTakeFirst();
        const row2 = await trx.selectFrom("media").select(["status", "trashedAt"]).where("id", "=", id2).executeTakeFirst();
        expect(row1?.status).toBe("published");
        expect(row1?.trashedAt).toBeNull();
        expect(row2?.status).toBe("draft");
        expect(row2?.trashedAt).toBeNull();

        // Trash id2 again, then bulk delete
        await trashTitle(id2, trx);
        const delForm = new FormData();
        delForm.append("ids", id2);
        await bulkDeleteForGoodTrash(delForm, trx);

        const delRow = await trx.selectFrom("media").select("id").where("id", "=", id2).executeTakeFirst();
        expect(delRow).toBeUndefined();
      });
    });
  });

  describe("episode operations", () => {
    it("creates episode, adds default embed source and refreshes series duration", async () => {
      await withRollback(async (trx) => {
        const seriesId = await createTestMedia(trx, undefined, {
          type: "series",
          duration: "",
          imdbId: "tt1234567",
        });

        const form = new FormData();
        form.append("series", seriesId);
        form.append("season", "1");
        form.append("episode", "1");
        form.append("title", "Pilot");
        form.append("minutes", "50");
        form.append("synopsis", "First episode synopsis.");

        const res = await createEpisode({}, form, trx);
        expect(res.ok).toBe(true);

        // Check episode created
        const episode = await trx
          .selectFrom("episode")
          .selectAll()
          .where("mediaId", "=", seriesId)
          .where("seasonNumber", "=", 1)
          .where("episodeNumber", "=", 1)
          .executeTakeFirst();
        expect(episode).toBeDefined();
        expect(episode?.title).toBe("Pilot");
        expect(episode?.duration).toBe("50 min");

        // Check series duration updated to 1 Season
        const series = await trx
          .selectFrom("media")
          .select("duration")
          .where("id", "=", seriesId)
          .executeTakeFirst();
        expect(series?.duration).toBe("1 Season");

        // Check embed source created for episode
        const source = await trx
          .selectFrom("video_source")
          .selectAll()
          .where("episodeId", "=", episode!.id)
          .executeTakeFirst();
        expect(source?.label).toBe("Server 1");
      });
    });

    it("updateEpisode modifies fields and refreshes duration", async () => {
      await withRollback(async (trx) => {
        const seriesId = await createTestMedia(trx, undefined, { type: "series", duration: "1 Season" });
        const epId = await createTestEpisode(trx, seriesId, undefined, {
          seasonNumber: 1,
          episodeNumber: 1,
          title: "Initial Title",
          duration: "40 min",
        });

        const form = new FormData();
        form.append("series", seriesId);
        form.append("season", "1");
        form.append("episode", "1");
        form.append("title", "Updated Title");
        form.append("minutes", "55");
        form.append("synopsis", "Updated synopsis.");

        const res = await updateEpisode(epId, {}, form, trx);
        expect(res.ok).toBe(true);

        const updated = await trx
          .selectFrom("episode")
          .selectAll()
          .where("id", "=", epId)
          .executeTakeFirst();
        expect(updated?.title).toBe("Updated Title");
        expect(updated?.duration).toBe("55 min");
      });
    });

    it("saveSeasonEpisodesAction reorders episodes safely using negative temporary numbers", async () => {
      await withRollback(async (trx) => {
        const seriesId = await createTestMedia(trx, undefined, { type: "series", duration: "1 Season" });
        const ep1 = await createTestEpisode(trx, seriesId, undefined, {
          seasonNumber: 1,
          episodeNumber: 1,
          title: "Episode One",
        });
        const ep2 = await createTestEpisode(trx, seriesId, undefined, {
          seasonNumber: 1,
          episodeNumber: 2,
          title: "Episode Two",
        });

        // Swap episode numbers: ep1 becomes 2, ep2 becomes 1
        const rows = [
          { id: ep1, episodeNumber: 2, title: "Episode One", duration: "45 min" },
          { id: ep2, episodeNumber: 1, title: "Episode Two", duration: "45 min" },
        ];

        const res = await saveSeasonEpisodesAction(seriesId, 1, rows, trx);
        expect(res.ok).toBe(true);

        const row1 = await trx.selectFrom("episode").select("episodeNumber").where("id", "=", ep1).executeTakeFirst();
        const row2 = await trx.selectFrom("episode").select("episodeNumber").where("id", "=", ep2).executeTakeFirst();

        expect(row1?.episodeNumber).toBe(2);
        expect(row2?.episodeNumber).toBe(1);
      });
    });

    it("deleteEpisode removes the episode and updates duration", async () => {
      await withRollback(async (trx) => {
        const seriesId = await createTestMedia(trx, undefined, { type: "series", duration: "1 Season" });
        const epId = await createTestEpisode(trx, seriesId);

        await deleteEpisode(epId, trx);

        const epRow = await trx.selectFrom("episode").select("id").where("id", "=", epId).executeTakeFirst();
        expect(epRow).toBeUndefined();

        const series = await trx.selectFrom("media").select("duration").where("id", "=", seriesId).executeTakeFirst();
        expect(series?.duration).toBe("");
      });
    });
  });

  describe("metadata edits & bulk operations", () => {
    it("updateTitle saves metadata and creates a title revision", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockAdminSession = {
          user: { id: userId, email: "admin@gayflix.test", role: "admin" },
        };

        const id = await createTestMedia(trx, undefined, { title: "Original Title", year: 2020 });

        const form = new FormData();
        form.append("title", "Updated Full Title");
        form.append("year", "2024");
        form.append("status", "published");
        form.append("runtime", "100");
        form.append("genres", "Drama");
        form.append("country", "US");
        form.append("language", "English");
        form.append("credit", "Director X");
        form.append("synopsis", "Full synopsis of the title.");
        form.append("posterUrl", NO_POSTER);

        const res = await updateTitle(id, {}, form, trx);
        expect(res.ok).toBe(true);

        const updated = await trx
          .selectFrom("media")
          .select(["title", "year"])
          .where("id", "=", id)
          .executeTakeFirst();
        expect(updated?.title).toBe("Updated Full Title");
        expect(updated?.year).toBe(2024);

        const revision = await trx
          .selectFrom("title_revision")
          .select(["mediaId", "actorId"])
          .where("mediaId", "=", id)
          .executeTakeFirst();
        expect(revision).toBeDefined();
        expect(revision?.actorId).toBe(userId);
      });
    });

    it("quickUpdateTitle updates scalar fields without leaving the page", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockAdminSession = {
          user: { id: userId, email: "admin@gayflix.test", role: "admin" },
        };

        const id = await createTestMedia(trx, undefined, { title: "Old Title", year: 2020 });

        const res = await quickUpdateTitle(
          {
            id,
            title: "Quick Title",
            year: 2023,
            status: "published",
            genres: ["Comedy", "Drama"],
          },
          trx
        );

        expect(res.ok).toBe(true);

        const updated = await trx
          .selectFrom("media")
          .select(["title", "year", "genres"])
          .where("id", "=", id)
          .executeTakeFirst();
        expect(updated?.title).toBe("Quick Title");
        expect(updated?.year).toBe(2023);
        expect(updated?.genres).toEqual(["Comedy", "Drama"]);
      });
    });

    it("bulkTagTitles adds and removes tags across selected titles", async () => {
      await withRollback(async (trx) => {
        const id1 = await createTestMedia(trx, undefined, { tags: ["gay", "drama"], genres: ["Drama"] });
        const id2 = await createTestMedia(trx, undefined, { tags: ["comedy"], genres: ["Comedy"] });

        const res = await bulkTagTitles(
          {
            ids: [id1, id2],
            addTags: ["romance"],
            removeTags: ["drama"],
            addGenres: ["Romance"],
          },
          trx
        );

        expect(res.ok).toBe(true);
        expect(res.count).toBe(2);

        const row1 = await trx.selectFrom("media").select(["tags", "genres"]).where("id", "=", id1).executeTakeFirst();
        expect(row1?.tags).toEqual(["gay", "romance"]);
        expect(row1?.genres).toEqual(["Drama", "Romance"]);

        const row2 = await trx.selectFrom("media").select(["tags", "genres"]).where("id", "=", id2).executeTakeFirst();
        expect(row2?.tags).toEqual(["comedy", "romance"]);
        expect(row2?.genres).toEqual(["Comedy", "Romance"]);
      });
    });
  });
});
