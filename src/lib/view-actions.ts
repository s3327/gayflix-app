"use server";

import { after } from "next/server";
import { findViewTarget } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
import { getSession } from "@/lib/session";
import { clientIp, keyedHash } from "@/lib/visitor";
import { trendingSince, utcDay, viewerKey } from "@/lib/views";

/*
 * Counts views for Trending: what counts is in src/lib/views.ts. The
 * player calls this when Play is pressed. Anyone can call it with any
 * id, so the id is looked up first, and only a published movie or an
 * episode of a published series counts.
 */

const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruned = 0;

export async function recordView(id: unknown): Promise<void> {
  if (!isMediaId(id)) return;
  const mediaId = await findViewTarget(id);
  if (!mediaId) return;

  const now = new Date();
  const day = utcDay(now);
  const session = await getSession();
  const viewer = keyedHash(
    viewerKey(day, session ? { userId: session.user.id } : { ip: await clientIp() })
  );
  // The all-time count goes up only when today's view is new. Raw SQL,
  // so the title's updatedAt (which orders /movie and /series) stays put.
  await db.$executeRaw`
    WITH counted AS (
      INSERT INTO media_view ("mediaId", viewer, day)
      VALUES (${mediaId}, ${viewer}, ${day}::date)
      ON CONFLICT DO NOTHING
      RETURNING "mediaId"
    )
    UPDATE media SET "viewCount" = "viewCount" + 1
    WHERE id IN (SELECT "mediaId" FROM counted)`;

  // Views from before Trending's window are never read again. At most
  // hourly per server, after the response is sent.
  if (now.getTime() - lastPruned > PRUNE_EVERY_MS) {
    lastPruned = now.getTime();
    after(() =>
      db.mediaView.deleteMany({ where: { day: { lt: new Date(trendingSince(now)) } } })
    );
  }
}
