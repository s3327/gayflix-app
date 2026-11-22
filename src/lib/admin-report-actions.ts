"use server";

import type { Kysely } from "kysely";
import { revalidatePath } from "next/cache";
import { setAdminFlash } from "@/lib/admin-flash";
import { moderationSession, FORBIDDEN_USERS } from "@/lib/admin-guard";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { isMediaId } from "@/lib/library-types";

/*
 * Server functions behind /admin/reports. Each one checks for an admin
 * itself (a direct POST never runs the panel layout).
 */

const REPORT_ID = /^[a-z0-9]{20,40}$/;

function requireReportId(id: unknown): string {
  if (typeof id !== "string" || !REPORT_ID.test(id)) throw new Error("Invalid report");
  return id;
}

export async function resolveReport(
  id: unknown,
  notesOrFormData?: string | FormData,
  executor: Kysely<DB> = database
): Promise<void> {
  const { session, allowed } = await moderationSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_USERS });
    return;
  }
  const reportId = requireReportId(id);
  const notes =
    typeof notesOrFormData === "string"
      ? notesOrFormData
      : notesOrFormData instanceof FormData
      ? ((notesOrFormData.get("notes") as string | null) ?? undefined)
      : undefined;
  await executor
    .updateTable("report")
    .set({
      resolvedAt: new Date(),
      resolvedBy: session.user.email,
      resolvedByUserId: session.user.id,
      notes: notes?.trim() || null,
    })
    .where("id", "=", reportId)
    .where("resolvedAt", "is", null)
    .execute();
  revalidatePath("/admin/reports");
  await setAdminFlash({
    message: "Report resolved.",
    undo: { label: "Undo", action: "reopen_report", ids: [reportId] },
  });
}

/** A triage group holds at most one page of reports. */
const MAX_GROUP_REPORTS = 50;

/**
 * Resolves the open reports in one triage group (one title or episode, one
 * reason), and can turn off the one video source the reports were about.
 */
export async function resolveAllForMedia(
  input: unknown,
  executor: Kysely<DB> = database
): Promise<{ ok: boolean; resolvedCount: number }> {
  const { session, allowed } = await moderationSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_USERS });
    return { ok: false, resolvedCount: 0 };
  }
  const fields = (input ?? {}) as Record<string, unknown>;
  const mediaId = fields.mediaId;
  const reportIds = Array.isArray(fields.reportIds)
    ? [...new Set(fields.reportIds)]
    : [];
  if (
    !isMediaId(mediaId) ||
    reportIds.length === 0 ||
    reportIds.length > MAX_GROUP_REPORTS ||
    !reportIds.every((id): id is string => typeof id === "string" && REPORT_ID.test(id))
  ) {
    return { ok: false, resolvedCount: 0 };
  }
  const notes =
    typeof fields.notes === "string" ? fields.notes.trim().slice(0, 1000) || null : null;
  const disableSourceId =
    typeof fields.disableSourceId === "string" && fields.disableSourceId !== ""
      ? fields.disableSourceId
      : null;

  // Only reports still open, and only ones about this title, are resolved.
  const open = await executor
    .selectFrom("report")
    .select("id")
    .where("id", "in", reportIds)
    .where("mediaId", "=", mediaId)
    .where("resolvedAt", "is", null)
    .execute();
  const ids = open.map((report) => report.id);

  let disabled = 0;
  if (disableSourceId) {
    const updateResult = await executor
      .updateTable("video_source")
      .set({ enabled: false })
      .where("id", "=", disableSourceId)
      .where((eb) =>
        eb.or([
          eb("mediaId", "=", mediaId),
          eb("episodeId", "=", mediaId),
        ])
      )
      .executeTakeFirst();
    disabled = Number(updateResult.numUpdatedRows);
  }

  let count = 0;
  if (ids.length > 0) {
    const updateResult = await executor
      .updateTable("report")
      .set({
        resolvedAt: new Date(),
        resolvedBy: session.user.email,
        resolvedByUserId: session.user.id,
        notes,
      })
      .where("id", "in", ids)
      .where("resolvedAt", "is", null)
      .executeTakeFirst();
    count = Number(updateResult.numUpdatedRows);
  }

  revalidatePath("/admin/reports");
  if (disabled) {
    revalidatePath("/admin/library/movies");
    revalidatePath("/admin/library/series");
    revalidatePath("/admin/library/episodes");
  }

  await setAdminFlash({
    message: `Resolved ${count} ${count === 1 ? "report" : "reports"}${
      disabled ? " and turned off that video source" : ""
    }.`,
    ...(count > 0 && { undo: { label: "Undo", action: "reopen_report", ids } }),
  });

  return { ok: true, resolvedCount: count };
}

export async function reopenReport(
  id: unknown,
  _formData?: unknown,
  executor: Kysely<DB> = database
): Promise<void> {
  void _formData;
  const { allowed } = await moderationSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_USERS });
    return;
  }
  const reportId = requireReportId(id);
  await executor
    .updateTable("report")
    .set({ resolvedAt: null, resolvedBy: null, resolvedByUserId: null })
    .where("id", "=", reportId)
    .execute();
  revalidatePath("/admin/reports");
  await setAdminFlash({
    message: "Report reopened.",
    undo: { label: "Undo", action: "resolve_report", ids: [reportId] },
  });
}
