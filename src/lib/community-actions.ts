"use server";

import type { Kysely } from "kysely";
import { isRatableTitle } from "@/lib/catalog";
import {
  checkNickname,
  cleanReviewBody,
  isReportReason,
  nicknameKey,
  REPORTS_PER_DAY,
  REVIEW_MAX,
  REVIEWS_PER_DAY,
} from "@/lib/community-rules";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { isMediaId } from "@/lib/library-types";
import { getSession } from "@/lib/session";
import { countOf } from "@/lib/sql-helpers";

/*
 * Server functions behind the community (A9): a member's nickname, their
 * reviews, putting a shared list on Community Lists, and reporting a
 * review or a list. Each is reachable by a direct POST, so each checks
 * the session and its input itself. Those behind a form return what to
 * tell the member ({ error }); the rest throw, and the browser shows a
 * toast.
 */

const REVIEW_ID = /^[a-z0-9]{20,40}$/;
const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `needsNickname`: the member has none, and none was given. */
export type FormResult =
  | { ok: true; nickname: string }
  | { ok: false; error: string; needsNickname?: boolean };

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  return session.user.id;
}

/**
 * The member's nickname: the one they have, or `wanted` saved as their
 * first. Changing it goes through setNickname.
 */
async function ensureNickname(
  userId: string,
  wanted: unknown,
  executor: Kysely<DB> = database
): Promise<FormResult> {
  const profile = await executor
    .selectFrom("member_profile")
    .select("nickname")
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (profile) return { ok: true, nickname: profile.nickname };
  if (wanted === undefined || wanted === null) {
    return { ok: false, error: "Choose a nickname first.", needsNickname: true };
  }
  return saveNickname(userId, wanted, executor);
}

async function saveNickname(
  userId: string,
  value: unknown,
  executor: Kysely<DB> = database
): Promise<FormResult> {
  const checked = checkNickname(value);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { nickname } = checked;
  const key = nicknameKey(nickname);

  const conflict = await executor
    .selectFrom("member_profile")
    .select("userId")
    .where("nicknameKey", "=", key)
    .where("userId", "!=", userId)
    .executeTakeFirst();
  if (conflict) {
    return { ok: false, error: "Someone already has that nickname. Choose another." };
  }

  const now = new Date();
  try {
    await executor
      .insertInto("member_profile")
      .values({ userId, nickname, nicknameKey: key, updatedAt: now })
      .onConflict((oc) =>
        oc.column("userId").doUpdateSet({
          nickname,
          nicknameKey: key,
          updatedAt: now,
        })
      )
      .execute();
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "23505") {
      return { ok: false, error: "Someone already has that nickname. Choose another." };
    }
    throw error;
  }
  return { ok: true, nickname };
}

/** Sets or changes the member's public nickname. */
export async function setNickname(
  value: unknown,
  executor: Kysely<DB> = database
): Promise<FormResult> {
  return saveNickname(await requireUserId(), value, executor);
}

/**
 * Posts the member's review of a published movie or series, or changes
 * it. A member without a nickname picks one with their first review.
 * A review a moderator hid stays hidden when it's changed.
 */
export async function saveReview(
  mediaId: unknown,
  body: unknown,
  nickname?: unknown,
  executor: Kysely<DB> = database
): Promise<FormResult> {
  const userId = await requireUserId();
  if (!isMediaId(mediaId) || !(await isRatableTitle(mediaId))) throw new Error("Title not found");
  const text = cleanReviewBody(body);
  if (!text) return { ok: false, error: `Write a review of up to ${REVIEW_MAX} characters.` };

  const existing = await executor
    .selectFrom("review")
    .select("id")
    .where("userId", "=", userId)
    .where("mediaId", "=", mediaId)
    .executeTakeFirst();
  if (!existing) {
    const row = await executor
      .selectFrom("review")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("userId", "=", userId)
      .where("createdAt", ">", new Date(Date.now() - DAY_MS))
      .executeTakeFirstOrThrow();
    if (countOf(row) >= REVIEWS_PER_DAY) {
      return { ok: false, error: "You've posted a lot of reviews today. Try again tomorrow." };
    }
  }

  const named = await ensureNickname(userId, nickname, executor);
  if (!named.ok) return named;
  const now = new Date();
  await executor
    .insertInto("review")
    .values({ userId, mediaId, body: text, updatedAt: now })
    .onConflict((oc) =>
      oc.columns(["userId", "mediaId"]).doUpdateSet({ body: text, updatedAt: now })
    )
    .execute();
  return named;
}

/** Deletes the member's own review of a title. */
export async function deleteReview(
  mediaId: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  if (!isMediaId(mediaId)) throw new Error("Invalid id");
  await executor
    .deleteFrom("review")
    .where("userId", "=", userId)
    .where("mediaId", "=", mediaId)
    .execute();
}

/**
 * Puts the member's shared list on Community Lists, or takes it off. A
 * member without a nickname picks one first. A list must be shared, and
 * one a moderator took off can't go back.
 */
export async function setListInCommunity(
  listId: unknown,
  on: unknown,
  nickname?: unknown,
  executor: Kysely<DB> = database
): Promise<FormResult | { ok: true; nickname: null }> {
  const userId = await requireUserId();
  if (typeof listId !== "string" || !LIST_ID.test(listId)) throw new Error("Invalid list");
  if (typeof on !== "boolean") throw new Error("Invalid setting");
  const list = await executor
    .selectFrom("media_list")
    .select(["isPublic", "communityBlocked"])
    .where("id", "=", listId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (!list) throw new Error("List not found");

  if (!on) {
    await executor
      .updateTable("media_list")
      .set({ inCommunity: false })
      .where("id", "=", listId)
      .execute();
    return { ok: true, nickname: null };
  }
  if (!list.isPublic) return { ok: false, error: "Share the list first." };
  if (list.communityBlocked) {
    return { ok: false, error: "A moderator took this list off Community Lists." };
  }
  const named = await ensureNickname(userId, nickname, executor);
  if (!named.ok) return named;
  await executor
    .updateTable("media_list")
    .set({ inCommunity: true })
    .where("id", "=", listId)
    .execute();
  return named;
}

/**
 * Reports someone else's review, or a list on Community Lists, to the
 * moderators. Reporting the same thing again changes nothing.
 */
export async function reportContent(
  target: unknown,
  reason: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const userId = await requireUserId();
  if (!isReportReason(reason)) throw new Error("Invalid reason");
  const { reviewId, listId } = (target ?? {}) as { reviewId?: unknown; listId?: unknown };

  if (reviewId !== undefined) {
    if (typeof reviewId !== "string" || !REVIEW_ID.test(reviewId)) throw new Error("Invalid review");
    const review = await executor
      .selectFrom("review")
      .select(["userId", "mediaId"])
      .where("id", "=", reviewId)
      .where("hiddenAt", "is", null)
      .executeTakeFirst();
    if (!review || review.userId === userId || !(await isRatableTitle(review.mediaId))) {
      throw new Error("Review not found");
    }
  } else if (listId !== undefined) {
    if (typeof listId !== "string" || !LIST_ID.test(listId)) throw new Error("Invalid list");
    const list = await executor
      .selectFrom("media_list")
      .select("userId")
      .where("id", "=", listId)
      .where("isPublic", "=", true)
      .where("inCommunity", "=", true)
      .where("communityBlocked", "=", false)
      .executeTakeFirst();
    if (!list || list.userId === userId) throw new Error("List not found");
  } else {
    throw new Error("Nothing to report");
  }

  const row = await executor
    .selectFrom("content_report")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("userId", "=", userId)
    .where("createdAt", ">", new Date(Date.now() - DAY_MS))
    .executeTakeFirstOrThrow();
  if (countOf(row) >= REPORTS_PER_DAY) throw new Error("Too many reports");

  let existingQuery = executor
    .selectFrom("content_report")
    .select("id")
    .where("userId", "=", userId);
  if (reviewId !== undefined) {
    existingQuery = existingQuery.where("reviewId", "=", reviewId as string);
  } else {
    existingQuery = existingQuery.where("listId", "=", listId as string);
  }
  const existing = await existingQuery.executeTakeFirst();
  if (existing) return;

  await executor
    .insertInto("content_report")
    .values({
      userId,
      reason,
      reviewId: reviewId !== undefined ? (reviewId as string) : null,
      listId: listId !== undefined ? (listId as string) : null,
    })
    .execute();
}
