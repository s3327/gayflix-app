import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/lib/db-types";
import { setRating } from "@/lib/rating-actions";
import { countOf } from "@/lib/sql-helpers";
import { recordView } from "@/lib/view-actions";
import { withRollback } from "@/test/database";

let mockUserId: string | null = null;
let mockIp = "203.0.113.1";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => (mockUserId ? { user: { id: mockUserId } } : null)),
}));

vi.mock("@/lib/visitor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/visitor")>();
  return {
    ...actual,
    clientIp: vi.fn(async () => mockIp),
  };
});

let mockRatable = true;
let mockViewTarget: string | null = null;

vi.mock("@/lib/catalog", () => ({
  findViewTarget: vi.fn(async () => mockViewTarget),
  isRatableTitle: vi.fn(async () => mockRatable),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
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
  initialViewCount = 0
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
      viewCount: initialViewCount,
    })
    .execute();
  return id;
}

describe("Views & Ratings Kysely integration", () => {
  beforeEach(() => {
    mockUserId = null;
    mockIp = "203.0.113.1";
    mockRatable = true;
    mockViewTarget = null;
  });

  describe("recordView", () => {
    it("the second view the same day doesn't raise viewCount", async () => {
      await withRollback(async (trx) => {
        const mediaId = await createTestMedia(trx);
        mockViewTarget = mediaId;
        mockUserId = null;
        mockIp = "203.0.113.10";

        // First view from this viewer
        await recordView(mediaId, trx);

        const afterFirst = await trx
          .selectFrom("media")
          .select("viewCount")
          .where("id", "=", mediaId)
          .executeTakeFirstOrThrow();
        expect(afterFirst.viewCount).toBe(1);

        const viewsAfterFirst = await trx
          .selectFrom("media_view")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("mediaId", "=", mediaId)
          .executeTakeFirstOrThrow();
        expect(countOf(viewsAfterFirst)).toBe(1);

        // Second view the same day from the same viewer
        await recordView(mediaId, trx);

        const afterSecond = await trx
          .selectFrom("media")
          .select("viewCount")
          .where("id", "=", mediaId)
          .executeTakeFirstOrThrow();
        expect(afterSecond.viewCount).toBe(1);

        const viewsAfterSecond = await trx
          .selectFrom("media_view")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("mediaId", "=", mediaId)
          .executeTakeFirstOrThrow();
        expect(countOf(viewsAfterSecond)).toBe(1);

        // Different viewer on the same day raises viewCount
        mockIp = "203.0.113.20";
        await recordView(mediaId, trx);

        const afterThird = await trx
          .selectFrom("media")
          .select("viewCount")
          .where("id", "=", mediaId)
          .executeTakeFirstOrThrow();
        expect(afterThird.viewCount).toBe(2);

        const viewsAfterThird = await trx
          .selectFrom("media_view")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("mediaId", "=", mediaId)
          .executeTakeFirstOrThrow();
        expect(countOf(viewsAfterThird)).toBe(2);
      });
    });

    it("ignores invalid media IDs and unknown view targets", async () => {
      await withRollback(async (trx) => {
        // Invalid media ID
        await recordView("invalid/media/id", trx);

        // Non-existent target
        mockViewTarget = null;
        await recordView("non-existent-id", trx);
      });
    });
  });

  describe("setRating", () => {
    it("rating twice keeps one row (and updates value if changed)", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);
        mockUserId = userId;
        mockRatable = true;

        // First rating: like
        await setRating(mediaId, "like", trx);

        let rows = await trx
          .selectFrom("media_rating")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", mediaId)
          .execute();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe("like");

        // Second rating: love (updates value)
        await setRating(mediaId, "love", trx);

        rows = await trx
          .selectFrom("media_rating")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", mediaId)
          .execute();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe("love");

        // Third rating: love again (keeps one row)
        await setRating(mediaId, "love", trx);

        rows = await trx
          .selectFrom("media_rating")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", mediaId)
          .execute();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe("love");

        // Take rating back (value = null) removes row
        await setRating(mediaId, null, trx);

        rows = await trx
          .selectFrom("media_rating")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", mediaId)
          .execute();
        expect(rows).toHaveLength(0);
      });
    });

    it("requires authentication, valid mediaId, valid rating, and existing title", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        // Not signed in
        mockUserId = null;
        await expect(setRating(mediaId, "like", trx)).rejects.toThrow("Not signed in");

        mockUserId = userId;

        // Invalid media ID
        await expect(setRating("invalid/media/id", "like", trx)).rejects.toThrow("Invalid id");

        // Invalid rating value
        await expect(setRating(mediaId, "invalid_rating", trx)).rejects.toThrow("Invalid rating");

        // Title not found / not ratable
        mockRatable = false;
        await expect(setRating(mediaId, "like", trx)).rejects.toThrow("Title not found");
      });
    });
  });
});
