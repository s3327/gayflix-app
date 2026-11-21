import type { Kysely } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { requireAdmin } from "@/lib/session";
import { getSiteSettings } from "@/lib/site-settings";
import { logActivity } from "@/lib/activity-logger";

export type BackfillResult = {
  ok: boolean;
  updated: number;
  threshold: number;
  message: string;
};

/**
 * Idempotently assigns "Short Film" category to all existing movies with
 * 0 < runtimeMinutes <= cutoff that do not currently have a category set.
 */
export async function backfillShortFilmCategories(
  cutoff?: number,
  executor: Kysely<DB> = database
): Promise<BackfillResult> {
  const session = await requireAdmin();
  const settings = await getSiteSettings();
  const threshold = cutoff ?? settings.shortFilmCutoffMinutes;

  const result = await executor
    .updateTable("media")
    .set({
      category: "Short Film",
    })
    .where("type", "=", "movie")
    .where("runtimeMinutes", ">", 0)
    .where("runtimeMinutes", "<=", threshold)
    .where("category", "is", null)
    .executeTakeFirst();

  const updated = Number(result?.numUpdatedRows ?? 0);

  if (updated > 0) {
    await logActivity({
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: "title.update",
      entityType: "media",
      entityId: "bulk",
      summary: `Backfilled "Short Film" category on ${updated} movie(s) with runtime <= ${threshold}m`,
      details: {
        updatedCount: updated,
        threshold,
      },
    });
  }

  return {
    ok: true,
    updated,
    threshold,
    message: `Successfully categorized ${updated} movie(s) as "Short Film".`,
  };
}
