"use server";

import { isRatableTitle } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
import { isRating, MAX_RATINGS } from "@/lib/ratings";
import { getSession } from "@/lib/session";

/*
 * The server function behind RatingsProvider: a member's rating of a
 * movie or a series (media_rating). Reachable by a direct POST, so it
 * checks the session and its input itself, and that the title is
 * published. It throws on bad input or no session; the provider undoes
 * its optimistic update and shows a toast.
 */

/** Rates title `mediaId` Not for me, Like or Love it, or (null) takes the rating back. */
export async function setRating(mediaId: unknown, value: unknown): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const userId = session.user.id;
  if (!isMediaId(mediaId)) throw new Error("Invalid id");
  if (value !== null && !isRating(value)) throw new Error("Invalid rating");

  if (value === null) {
    await db.mediaRating.deleteMany({ where: { userId, mediaId } });
    return;
  }
  if (!(await isRatableTitle(mediaId))) throw new Error("Title not found");
  const existing = await db.mediaRating.findUnique({
    where: { userId_mediaId: { userId, mediaId } },
    select: { value: true },
  });
  if (!existing && (await db.mediaRating.count({ where: { userId } })) >= MAX_RATINGS) {
    throw new Error("Too many ratings");
  }
  const ratedAt = new Date();
  await db.mediaRating.upsert({
    where: { userId_mediaId: { userId, mediaId } },
    create: { userId, mediaId, value, ratedAt },
    update: { value, ratedAt },
  });
}
