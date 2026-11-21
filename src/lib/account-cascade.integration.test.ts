import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "@/lib/database";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Deleting an account (Supabase Auth's admin API, as the account page and
 * /admin/users do) takes the member's own data with it, through the
 * foreign keys to auth.users (supabase/migrations/
 * 20261125000000_user_ids_to_supabase.sql). Reports and audit trails stay,
 * with the id cleared. Auth commits its own writes, so nothing here rolls
 * back: the test uses a throwaway account and title, and removes what is
 * left afterwards.
 */
const hasAuthApi = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

const MEDIA_ID = `cascade-test-${randomUUID()}`;
const ENTRY = { id: MEDIA_ID, type: "movie", title: "Cascade test" };

describe.skipIf(!hasAuthApi)("deleting an account", () => {
  let userId: string | undefined;
  const reportIds: string[] = [];
  const activityIds: string[] = [];

  beforeAll(async () => {
    await database
      .insertInto("media")
      .values({
        id: MEDIA_ID,
        type: "movie",
        title: "Cascade test",
        year: 2026,
        duration: "1h 30m",
        country: "Thailand",
        language: "Thai",
        posterUrl: "/posters/cascade-test.jpg",
      })
      .execute();
  });

  afterAll(async () => {
    if (userId) await supabaseAdmin().auth.admin.deleteUser(userId).catch(() => {});
    if (reportIds.length) await database.deleteFrom("report").where("id", "in", reportIds).execute();
    if (activityIds.length) await database.deleteFrom("activity_log").where("id", "in", activityIds).execute();
    await database.deleteFrom("media").where("id", "=", MEDIA_ID).execute();
  });

  it("removes the member's data, and keeps reports and audit rows without the id", async () => {
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email: `cascade-${randomUUID()}@gayflix.test`,
      password: "cascade-test-password-1",
      email_confirm: true,
    });
    if (error) throw error;
    const id = data.user.id;
    userId = id;

    await database.insertInto("favorite").values({ userId: id, mediaId: MEDIA_ID, entry: ENTRY }).execute();
    await database.insertInto("watchlist_item").values({ userId: id, mediaId: MEDIA_ID, entry: ENTRY }).execute();
    await database.insertInto("watch_history").values({ userId: id, mediaId: MEDIA_ID, entry: ENTRY }).execute();
    await database.insertInto("media_rating").values({ userId: id, mediaId: MEDIA_ID, value: "love" }).execute();
    const list = await database
      .insertInto("media_list")
      .values({ userId: id, name: "Cascade list" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await database.insertInto("list_item").values({ listId: list.id, mediaId: MEDIA_ID, entry: ENTRY }).execute();
    const nickname = `cascade${randomUUID().slice(0, 8)}`;
    await database
      .insertInto("member_profile")
      .values({ userId: id, nickname, nicknameKey: nickname })
      .execute();
    const review = await database
      .insertInto("review")
      .values({ userId: id, mediaId: MEDIA_ID, body: "A cascade test review." })
      .returning("id")
      .executeTakeFirstOrThrow();
    await database
      .insertInto("content_report")
      .values({ userId: id, reviewId: review.id, reason: "spam" })
      .execute();
    const report = await database
      .insertInto("report")
      .values({ userId: id, resolvedByUserId: id, mediaId: MEDIA_ID, mediaTitle: "Cascade test", reason: "broken" })
      .returning("id")
      .executeTakeFirstOrThrow();
    reportIds.push(report.id);
    const activity = await database
      .insertInto("activity_log")
      .values({ actorId: id, actorEmail: "staff@gayflix.test", action: "test", entityType: "test", summary: "cascade" })
      .returning("id")
      .executeTakeFirstOrThrow();
    activityIds.push(activity.id);

    const deleted = await supabaseAdmin().auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
    userId = undefined;

    for (const table of [
      "favorite",
      "watchlist_item",
      "watch_history",
      "media_rating",
      "media_list",
      "member_profile",
      "review",
      "content_report",
    ] as const) {
      const rows = await database.selectFrom(table).select("userId").where("userId", "=", id).execute();
      expect(rows, table).toEqual([]);
    }
    expect(await database.selectFrom("list_item").select("listId").where("listId", "=", list.id).execute()).toEqual(
      []
    );
    expect(await database.selectFrom("profile").select("id").where("id", "=", id).execute()).toEqual([]);

    const kept = await database
      .selectFrom("report")
      .select(["userId", "resolvedByUserId"])
      .where("id", "=", report.id)
      .executeTakeFirstOrThrow();
    expect(kept).toEqual({ userId: null, resolvedByUserId: null });
    const audit = await database
      .selectFrom("activity_log")
      .select("actorId")
      .where("id", "=", activity.id)
      .executeTakeFirstOrThrow();
    expect(audit.actorId).toBeNull();
  });
});
