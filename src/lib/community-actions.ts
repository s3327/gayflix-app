"use server";

import { Prisma } from "@/generated/prisma/client";
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
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
import { getSession } from "@/lib/session";

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
async function ensureNickname(userId: string, wanted: unknown): Promise<FormResult> {
  const profile = await db.memberProfile.findUnique({ where: { userId }, select: { nickname: true } });
  if (profile) return { ok: true, nickname: profile.nickname };
  if (wanted === undefined || wanted === null) {
    return { ok: false, error: "Choose a nickname first.", needsNickname: true };
  }
  return saveNickname(userId, wanted);
}

async function saveNickname(userId: string, value: unknown): Promise<FormResult> {
  const checked = checkNickname(value);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { nickname } = checked;
  try {
    await db.memberProfile.upsert({
      where: { userId },
      create: { userId, nickname, nicknameKey: nicknameKey(nickname) },
      update: { nickname, nicknameKey: nicknameKey(nickname) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Someone already has that nickname. Choose another." };
    }
    throw error;
  }
  return { ok: true, nickname };
}

/** Sets or changes the member's public nickname. */
export async function setNickname(value: unknown): Promise<FormResult> {
  return saveNickname(await requireUserId(), value);
}

/**
 * Posts the member's review of a published movie or series, or changes
 * it. A member without a nickname picks one with their first review.
 * A review a moderator hid stays hidden when it's changed.
 */
export async function saveReview(
  mediaId: unknown,
  body: unknown,
  nickname?: unknown
): Promise<FormResult> {
  const userId = await requireUserId();
  if (!isMediaId(mediaId) || !(await isRatableTitle(mediaId))) throw new Error("Title not found");
  const text = cleanReviewBody(body);
  if (!text) return { ok: false, error: `Write a review of up to ${REVIEW_MAX} characters.` };

  const existing = await db.review.findUnique({
    where: { userId_mediaId: { userId, mediaId } },
    select: { id: true },
  });
  if (!existing) {
    const recent = await db.review.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= REVIEWS_PER_DAY) {
      return { ok: false, error: "You've posted a lot of reviews today. Try again tomorrow." };
    }
  }

  const named = await ensureNickname(userId, nickname);
  if (!named.ok) return named;
  await db.review.upsert({
    where: { userId_mediaId: { userId, mediaId } },
    create: { userId, mediaId, body: text },
    update: { body: text },
  });
  return named;
}

/** Deletes the member's own review of a title. */
export async function deleteReview(mediaId: unknown): Promise<void> {
  const userId = await requireUserId();
  if (!isMediaId(mediaId)) throw new Error("Invalid id");
  await db.review.deleteMany({ where: { userId, mediaId } });
}

/**
 * Puts the member's shared list on Community Lists, or takes it off. A
 * member without a nickname picks one first. A list must be shared, and
 * one a moderator took off can't go back.
 */
export async function setListInCommunity(
  listId: unknown,
  on: unknown,
  nickname?: unknown
): Promise<FormResult | { ok: true; nickname: null }> {
  const userId = await requireUserId();
  if (typeof listId !== "string" || !LIST_ID.test(listId)) throw new Error("Invalid list");
  if (typeof on !== "boolean") throw new Error("Invalid setting");
  const list = await db.mediaList.findFirst({
    where: { id: listId, userId },
    select: { isPublic: true, communityBlocked: true },
  });
  if (!list) throw new Error("List not found");

  if (!on) {
    await db.mediaList.update({ where: { id: listId }, data: { inCommunity: false } });
    return { ok: true, nickname: null };
  }
  if (!list.isPublic) return { ok: false, error: "Share the list first." };
  if (list.communityBlocked) {
    return { ok: false, error: "A moderator took this list off Community Lists." };
  }
  const named = await ensureNickname(userId, nickname);
  if (!named.ok) return named;
  await db.mediaList.update({ where: { id: listId }, data: { inCommunity: true } });
  return named;
}

/**
 * Reports someone else's review, or a list on Community Lists, to the
 * moderators. Reporting the same thing again changes nothing.
 */
export async function reportContent(
  target: unknown,
  reason: unknown
): Promise<void> {
  const userId = await requireUserId();
  if (!isReportReason(reason)) throw new Error("Invalid reason");
  const { reviewId, listId } = (target ?? {}) as { reviewId?: unknown; listId?: unknown };

  if (reviewId !== undefined) {
    if (typeof reviewId !== "string" || !REVIEW_ID.test(reviewId)) throw new Error("Invalid review");
    const review = await db.review.findFirst({
      where: { id: reviewId, hiddenAt: null },
      select: { userId: true, mediaId: true },
    });
    if (!review || review.userId === userId || !(await isRatableTitle(review.mediaId))) {
      throw new Error("Review not found");
    }
  } else if (listId !== undefined) {
    if (typeof listId !== "string" || !LIST_ID.test(listId)) throw new Error("Invalid list");
    const list = await db.mediaList.findFirst({
      where: { id: listId, isPublic: true, inCommunity: true, communityBlocked: false },
      select: { userId: true },
    });
    if (!list || list.userId === userId) throw new Error("List not found");
  } else {
    throw new Error("Nothing to report");
  }

  const recent = await db.contentReport.count({
    where: { userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
  });
  if (recent >= REPORTS_PER_DAY) throw new Error("Too many reports");
  const existing = await db.contentReport.findFirst({
    where: reviewId !== undefined ? { reviewId: reviewId as string, userId } : { listId: listId as string, userId },
    select: { id: true },
  });
  if (existing) return;
  await db.contentReport.create({
    data: {
      userId,
      reason,
      ...(reviewId !== undefined ? { reviewId: reviewId as string } : { listId: listId as string }),
    },
  });
}
