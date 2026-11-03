import { db } from "@/lib/db";
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
export async function backfillShortFilmCategories(cutoff?: number): Promise<BackfillResult> {
  const session = await requireAdmin();
  const settings = await getSiteSettings();
  const threshold = cutoff ?? settings.shortFilmCutoffMinutes;

  const result = await db.media.updateMany({
    where: {
      type: "movie",
      runtimeMinutes: { gt: 0, lte: threshold },
      category: null,
    },
    data: {
      category: "Short Film",
    },
  });

  if (result.count > 0) {
    await logActivity({
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: "title.update",
      entityType: "media",
      entityId: "bulk",
      summary: `Backfilled "Short Film" category on ${result.count} movie(s) with runtime <= ${threshold}m`,
      details: {
        updatedCount: result.count,
        threshold,
      },
    });
  }

  return {
    ok: true,
    updated: result.count,
    threshold,
    message: `Successfully categorized ${result.count} movie(s) as "Short Film".`,
  };
}
