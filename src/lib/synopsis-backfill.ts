"use server";

import type { Kysely } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { requireAdmin } from "@/lib/session";
import { canManageSettings } from "@/lib/admin-roles";
import { FORBIDDEN_SETTINGS } from "@/lib/admin-guard";
import { stripHtmlAndEntities } from "@/lib/sanitize-text";

export async function backfillCleanSynopses(
  executor: Kysely<DB> = database
): Promise<{
  ok: boolean;
  message: string;
  mediaUpdated: number;
  episodesUpdated: number;
}> {
  const session = await requireAdmin();
  if (!canManageSettings(session.user.role)) {
    return { ok: false, message: FORBIDDEN_SETTINGS, mediaUpdated: 0, episodesUpdated: 0 };
  }

  const mediaRows = await executor
    .selectFrom("media")
    .select(["id", "synopsis"])
    .where((eb) =>
      eb.or([eb("synopsis", "like", "%<%"), eb("synopsis", "like", "%&%")])
    )
    .execute();

  let mediaUpdated = 0;
  for (const row of mediaRows) {
    if (!row.synopsis) continue;
    const cleaned = stripHtmlAndEntities(row.synopsis);
    if (cleaned !== row.synopsis) {
      await executor
        .updateTable("media")
        .set({ synopsis: cleaned })
        .where("id", "=", row.id)
        .execute();
      mediaUpdated++;
    }
  }

  const episodeRows = await executor
    .selectFrom("episode")
    .select(["id", "synopsis"])
    .where((eb) =>
      eb.or([eb("synopsis", "like", "%<%"), eb("synopsis", "like", "%&%")])
    )
    .execute();

  let episodesUpdated = 0;
  for (const row of episodeRows) {
    if (!row.synopsis) continue;
    const cleaned = stripHtmlAndEntities(row.synopsis);
    if (cleaned !== row.synopsis) {
      await executor
        .updateTable("episode")
        .set({ synopsis: cleaned })
        .where("id", "=", row.id)
        .execute();
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
