"use server";

import type { Kysely } from "kysely";
import { isRatableTitle } from "@/lib/catalog";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { isMediaId } from "@/lib/library-types";
import { isRating, MAX_RATINGS } from "@/lib/ratings";
import { getSession } from "@/lib/session";
import { countOf } from "@/lib/sql-helpers";

/*
 * The server function behind RatingsProvider: a member's rating of a
 * movie or a series (media_rating). Reachable by a direct POST, so it
 * checks the session and its input itself, and that the title is
 * published. It throws on bad input or no session; the provider undoes
 * its optimistic update and shows a toast.
 */

/** Rates title `mediaId` Not for me, Like or Love it, or (null) takes the rating back. */
export async function setRating(
  mediaId: unknown,
  value: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const userId = session.user.id;
  if (!isMediaId(mediaId)) throw new Error("Invalid id");
  if (value !== null && !isRating(value)) throw new Error("Invalid rating");

  if (value === null) {
    await executor
      .deleteFrom("media_rating")
      .where("userId", "=", userId)
      .where("mediaId", "=", mediaId)
      .execute();
    return;
  }
  if (!(await isRatableTitle(mediaId))) throw new Error("Title not found");
  const existing = await executor
    .selectFrom("media_rating")
    .select("value")
    .where("userId", "=", userId)
    .where("mediaId", "=", mediaId)
    .executeTakeFirst();
  if (!existing) {
    const row = await executor
      .selectFrom("media_rating")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    if (countOf(row) >= MAX_RATINGS) {
      throw new Error("Too many ratings");
    }
  }
  const ratedAt = new Date();
  await executor
    .insertInto("media_rating")
    .values({ userId, mediaId, value, ratedAt })
    .onConflict((oc) =>
      oc.columns(["userId", "mediaId"]).doUpdateSet({ value, ratedAt })
    )
    .execute();
}
