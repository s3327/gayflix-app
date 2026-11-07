"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { canManageSettings } from "@/lib/admin-roles";
import { FORBIDDEN_SETTINGS } from "@/lib/admin-guard";
import { stripHtmlAndEntities } from "@/lib/sanitize-text";

export async function backfillCleanSynopses(): Promise<{
  ok: boolean;
  message: string;
  mediaUpdated: number;
  episodesUpdated: number;
}> {
  const session = await requireAdmin();
  if (!canManageSettings(session.user.role)) {
    return { ok: false, message: FORBIDDEN_SETTINGS, mediaUpdated: 0, episodesUpdated: 0 };
  }

  const mediaRows = await db.media.findMany({
    where: {
      OR: [
        { synopsis: { contains: "<" } },
        { synopsis: { contains: "&" } },
      ],
    },
    select: { id: true, synopsis: true },
  });

  let mediaUpdated = 0;
  for (const row of mediaRows) {
    const cleaned = stripHtmlAndEntities(row.synopsis);
    if (cleaned !== row.synopsis) {
      await db.media.update({
        where: { id: row.id },
        data: { synopsis: cleaned },
      });
      mediaUpdated++;
    }
  }

  const episodeRows = await db.episode.findMany({
    where: {
      OR: [
        { synopsis: { contains: "<" } },
        { synopsis: { contains: "&" } },
      ],
    },
    select: { id: true, synopsis: true },
  });

  let episodesUpdated = 0;
  for (const row of episodeRows) {
    if (!row.synopsis) continue;
    const cleaned = stripHtmlAndEntities(row.synopsis);
    if (cleaned !== row.synopsis) {
      await db.episode.update({
        where: { id: row.id },
        data: { synopsis: cleaned },
      });
      episodesUpdated++;
    }
  }

  return {
    ok: true,
    message: `Sanitized ${mediaUpdated} titles and ${episodesUpdated} episodes.`,
    mediaUpdated,
    episodesUpdated,
  };
}
