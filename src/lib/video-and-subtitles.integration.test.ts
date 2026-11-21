import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import { sql } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB, Episode, Media } from "@/lib/db-types";
import {
  addVideoSource,
  deleteVideoSource,
  moveVideoSource,
  setVideoSourceEnabled,
  updateVideoSource,
} from "@/lib/admin-video-actions";
import {
  deleteSubtitle,
  uploadSubtitle,
} from "@/lib/admin-subtitle-actions";
import {
  createTitleRevision,
  getTitleRevisions,
  rollbackTitleRevision,
} from "@/lib/title-revisions";
import {
  getSubtitleFile,
  getSubtitles,
  getVideoSources,
} from "@/lib/catalog";
import { GONE } from "@/lib/catalog-owner";
import { NO_POSTER } from "@/lib/title-form";
import { MAX_VIDEO_SOURCES } from "@/lib/video-source";
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

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
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
      title: `Episode 1`,
      duration: "45m",
      ...overrides,
    })
    .execute();
  return id;
}

const SAMPLE_VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world\n";

describe("video sources & subtitles integration", () => {
  beforeEach(() => {
    mockAdminSession = {
      user: { id: randomUUID(), email: "admin@gayflix.test", role: "admin" },
    };
    mockAdminAllowed = true;
  });

  describe("video sources", () => {
    it("a source off VIDEO_HOSTS is refused", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);

        const form = new FormData();
        form.append("label", "Bad Server");
        form.append("kind", "auto");
        form.append("url", "https://evil.example.com/video.m3u8");

        const result = await addVideoSource("movie", mediaId, {}, form, trx);
        expect(result.ok).toBeFalsy();
        expect(result.errors?.url).toBeDefined();

        const count = await trx
          .selectFrom("video_source")
          .select((eb) => eb.fn.countAll().as("total"))
          .where("mediaId", "=", mediaId)
          .executeTakeFirst();
        expect(Number(count?.total ?? 0)).toBe(0);
      });
    });

    it("adds, updates, toggles, reorders and deletes video sources on allowed hosts", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);

        // 1. Add valid source
        const form1 = new FormData();
        form1.append("label", "Server 1");
        form1.append("kind", "auto");
        form1.append("url", "https://gayflix.my.id/stream/1.m3u8");

        const res1 = await addVideoSource("movie", mediaId, {}, form1, trx);
        expect(res1.ok).toBe(true);

        // Add second source
        const form2 = new FormData();
        form2.append("label", "Server 2");
        form2.append("kind", "embed");
        form2.append("url", "https://gayflix.my.id/embed/2");

        const res2 = await addVideoSource("movie", mediaId, {}, form2, trx);
        expect(res2.ok).toBe(true);

        const sources = await trx
          .selectFrom("video_source")
          .selectAll()
          .where("mediaId", "=", mediaId)
          .orderBy("position", "asc")
          .execute();
        expect(sources).toHaveLength(2);
        expect(sources[0].label).toBe("Server 1");
        expect(sources[1].label).toBe("Server 2");
        expect(sources[0].position).toBe(1);
        expect(sources[1].position).toBe(2);

        // 2. Update source 1
        const updateForm = new FormData();
        updateForm.append("label", "Updated Server 1");
        updateForm.append("kind", "file");
        updateForm.append("url", "https://gayflix.my.id/direct/1.mp4");

        const updateRes = await updateVideoSource(sources[0].id, {}, updateForm, trx);
        expect(updateRes.ok).toBe(true);

        const updated = await trx
          .selectFrom("video_source")
          .selectAll()
          .where("id", "=", sources[0].id)
          .executeTakeFirstOrThrow();
        expect(updated.label).toBe("Updated Server 1");
        expect(updated.kind).toBe("file");
        expect(updated.url).toBe("https://gayflix.my.id/direct/1.mp4");

        // 3. Toggle enabled
        await setVideoSourceEnabled(sources[0].id, false, trx);
        const disabled = await trx
          .selectFrom("video_source")
          .select("enabled")
          .where("id", "=", sources[0].id)
          .executeTakeFirstOrThrow();
        expect(disabled.enabled).toBe(false);

        // 4. Move source 2 up
        await moveVideoSource(sources[1].id, "up", trx);
        const reordered = await trx
          .selectFrom("video_source")
          .selectAll()
          .where("mediaId", "=", mediaId)
          .orderBy("position", "asc")
          .execute();
        expect(reordered[0].id).toBe(sources[1].id);
        expect(reordered[1].id).toBe(sources[0].id);

        // 5. Delete source
        await deleteVideoSource(sources[1].id, trx);
        const remaining = await trx
          .selectFrom("video_source")
          .selectAll()
          .where("mediaId", "=", mediaId)
          .execute();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(sources[0].id);
      });
    });

    it("refuses adding video source to a trashed title", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx, undefined, { trashedAt: new Date() });

        const form = new FormData();
        form.append("label", "Server 1");
        form.append("kind", "auto");
        form.append("url", "https://gayflix.my.id/stream/1.m3u8");

        const result = await addVideoSource("movie", mediaId, {}, form, trx);
        expect(result.message).toBe(GONE);
      });
    });

    it("enforces MAX_VIDEO_SOURCES limit", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);

        for (let i = 0; i < MAX_VIDEO_SOURCES; i++) {
          await trx
            .insertInto("video_source")
            .values({
              mediaId,
              label: `Server ${i + 1}`,
              kind: "hls",
              url: `https://gayflix.my.id/stream/${i + 1}.m3u8`,
              position: i + 1,
            })
            .execute();
        }

        const form = new FormData();
        form.append("label", "Overflow Server");
        form.append("kind", "auto");
        form.append("url", "https://gayflix.my.id/stream/overflow.m3u8");

        const result = await addVideoSource("movie", mediaId, {}, form, trx);
        expect(result.message).toContain(`There can be ${MAX_VIDEO_SOURCES} sources at most.`);
      });
    });

    it("getVideoSources returns enabled sources for published titles only", async () => {
      await withRollback(async (trx) => {
        const publishedMovieId = await createTestMedia(trx, undefined, { status: "published" });
        const draftMovieId = await createTestMedia(trx, undefined, { status: "draft" });

        await trx
          .insertInto("video_source")
          .values([
            {
              mediaId: publishedMovieId,
              label: "Tab 1",
              kind: "hls",
              url: "https://gayflix.my.id/s1.m3u8",
              position: 1,
              enabled: true,
            },
            {
              mediaId: publishedMovieId,
              label: "Tab 2 (disabled)",
              kind: "hls",
              url: "https://gayflix.my.id/s2.m3u8",
              position: 2,
              enabled: false,
            },
            {
              mediaId: draftMovieId,
              label: "Draft Tab",
              kind: "hls",
              url: "https://gayflix.my.id/draft.m3u8",
              position: 1,
              enabled: true,
            },
          ])
          .execute();

        const publishedSources = await getVideoSources({ mediaId: publishedMovieId }, trx);
        expect(publishedSources).toHaveLength(1);
        expect(publishedSources[0].label).toBe("Tab 1");

        const draftSources = await getVideoSources({ mediaId: draftMovieId }, trx);
        expect(draftSources).toHaveLength(0);

        // Episode of published series
        const seriesId = await createTestMedia(trx, undefined, { type: "series", status: "published" });
        const episodeId = await createTestEpisode(trx, seriesId);

        await trx
          .insertInto("video_source")
          .values({
            episodeId,
            label: "Episode Tab 1",
            kind: "hls",
            url: "https://gayflix.my.id/ep1.m3u8",
            position: 1,
            enabled: true,
          })
          .execute();

        const epSources = await getVideoSources({ episodeId }, trx);
        expect(epSources).toHaveLength(1);
        expect(epSources[0].label).toBe("Episode Tab 1");
      });
    });
  });

  describe("subtitles", () => {
    it("a subtitle for a draft title returns null", async () => {
      await withRollback(async (trx) => {
        // Draft movie subtitle
        const draftMovieId = await createTestMedia(trx, undefined, { status: "draft" });
        const subRow = await trx
          .insertInto("subtitle")
          .values({
            mediaId: draftMovieId,
            language: "en",
            fileName: "movie_en.vtt",
            content: SAMPLE_VTT,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        // When title is a draft, getSubtitleFile returns null
        const draftContent = await getSubtitleFile(subRow.id, trx);
        expect(draftContent).toBeNull();

        // When title is published, getSubtitleFile returns the subtitle content
        await trx
          .updateTable("media")
          .set({ status: "published" })
          .where("id", "=", draftMovieId)
          .execute();

        const publishedContent = await getSubtitleFile(subRow.id, trx);
        expect(publishedContent).toBe(SAMPLE_VTT);
      });
    });

    it("returns null for draft series episode subtitle, and content when published", async () => {
      await withRollback(async (trx) => {
        const draftSeriesId = await createTestMedia(trx, undefined, { type: "series", status: "draft" });
        const episodeId = await createTestEpisode(trx, draftSeriesId);

        const subRow = await trx
          .insertInto("subtitle")
          .values({
            episodeId,
            language: "th",
            fileName: "ep_th.vtt",
            content: SAMPLE_VTT,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        expect(await getSubtitleFile(subRow.id, trx)).toBeNull();

        await trx
          .updateTable("media")
          .set({ status: "published" })
          .where("id", "=", draftSeriesId)
          .execute();

        expect(await getSubtitleFile(subRow.id, trx)).toBe(SAMPLE_VTT);
      });
    });

    it("uploads and replaces subtitles, and deletes them", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);

        // Upload English subtitles
        const form1 = new FormData();
        form1.append("language", "en");
        const file1 = new File([SAMPLE_VTT], "subtitles.vtt", { type: "text/vtt" });
        form1.append("file", file1);

        const res1 = await uploadSubtitle("movie", mediaId, {}, form1, trx);
        expect(res1.ok).toBe(true);

        const tracks1 = await getSubtitles({ mediaId }, trx);
        expect(tracks1).toHaveLength(1);
        expect(tracks1[0].language).toBe("en");

        // Upload new file for English subtitles (should replace)
        const updatedVtt = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nUpdated\n";
        const form2 = new FormData();
        form2.append("language", "en");
        const file2 = new File([updatedVtt], "subtitles_v2.vtt", { type: "text/vtt" });
        form2.append("file", file2);

        const res2 = await uploadSubtitle("movie", mediaId, {}, form2, trx);
        expect(res2.ok).toBe(true);

        const tracks2 = await getSubtitles({ mediaId }, trx);
        expect(tracks2).toHaveLength(1);
        const subContent = await getSubtitleFile(tracks2[0].id, trx);
        expect(subContent).toBe(updatedVtt);

        // Delete subtitle
        await deleteSubtitle(tracks2[0].id, trx);
        const tracksAfterDelete = await getSubtitles({ mediaId }, trx);
        expect(tracksAfterDelete).toHaveLength(0);
      });
    });

    it("getSubtitleFile returns null for invalid or non-existent ids", async () => {
      await withRollback(async (trx) => {
        expect(await getSubtitleFile("invalid-id", trx)).toBeNull();
        expect(await getSubtitleFile("01234567890123456789012345", trx)).toBeNull();
      });
    });
  });

  describe("title revisions", () => {
    it("creates, fetches and rolls back title revisions", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockAdminSession = {
          user: { id: userId, email: "admin@gayflix.test", role: "admin" },
        };
        const mediaId = await createTestMedia(trx, undefined, {
          title: "Original Title",
          year: 2020,
          status: "draft",
        });

        // 1. Create title revision
        await createTitleRevision(
          {
            mediaId,
            actorId: userId,
            actorEmail: "admin@gayflix.test",
            summary: "Initial snapshot",
          },
          trx
        );

        const revisions = await getTitleRevisions(mediaId, trx);
        expect(revisions).toHaveLength(1);
        expect(revisions[0].mediaId).toBe(mediaId);
        expect(revisions[0].summary).toBe("Initial snapshot");
        expect(revisions[0].createdAt).toBeInstanceOf(Date);

        // 2. Modify title in media table
        await trx
          .updateTable("media")
          .set({ title: "Updated Title", year: 2022 })
          .where("id", "=", mediaId)
          .execute();

        // 3. Roll back to revision 1
        const rollbackRes = await rollbackTitleRevision(revisions[0].id, trx);
        expect(rollbackRes.ok).toBe(true);

        const rolledBackMedia = await trx
          .selectFrom("media")
          .selectAll()
          .where("id", "=", mediaId)
          .executeTakeFirstOrThrow();

        expect(rolledBackMedia.title).toBe("Original Title");
        expect(rolledBackMedia.year).toBe(2020);

        // 4. Rollback creates another revision of pre-rollback state
        const allRevisions = await getTitleRevisions(mediaId, trx);
        expect(allRevisions.length).toBeGreaterThan(1);
      });
    });

    it("refuses rollback when title is trashed", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        mockAdminSession = {
          user: { id: userId, email: "admin@gayflix.test", role: "admin" },
        };
        const mediaId = await createTestMedia(trx);

        await createTitleRevision(
          {
            mediaId,
            actorId: userId,
            actorEmail: "admin@gayflix.test",
            summary: "Snapshot",
          },
          trx
        );

        const revisions = await getTitleRevisions(mediaId, trx);

        // Trash the title
        await trx
          .updateTable("media")
          .set({ trashedAt: new Date() })
          .where("id", "=", mediaId)
          .execute();

        const res = await rollbackTitleRevision(revisions[0].id, trx);
        expect(res.ok).toBe(false);
        expect(res.message).toContain("trash");
      });
    });
  });
});
