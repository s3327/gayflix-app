"use server";

import { revalidatePath } from "next/cache";
import { setAdminFlash } from "@/lib/admin-flash";
import { db } from "@/lib/db";
import { moderationSession, FORBIDDEN_USERS } from "@/lib/admin-guard";
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
  notesOrFormData?: string | FormData
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
  await db.report.updateMany({
    where: { id: reportId, resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolvedBy: session.user.email,
      resolvedByUserId: session.user.id,
      notes: notes?.trim() || null,
    },
  });
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
  input: unknown
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
  const open = await db.report.findMany({
    where: { id: { in: reportIds }, mediaId, resolvedAt: null },
    select: { id: true },
  });
  const ids = open.map((report) => report.id);

  let disabled = 0;
  if (disableSourceId) {
    ({ count: disabled } = await db.videoSource.updateMany({
      where: { id: disableSourceId, OR: [{ mediaId }, { episodeId: mediaId }] },
      data: { enabled: false },
    }));
  }

  const { count } = ids.length
    ? await db.report.updateMany({
        where: { id: { in: ids }, resolvedAt: null },
        data: {
          resolvedAt: new Date(),
          resolvedBy: session.user.email,
          resolvedByUserId: session.user.id,
          notes,
        },
      })
    : { count: 0 };

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

export async function reopenReport(id: unknown, _formData?: unknown): Promise<void> {
  void _formData;
  const { allowed } = await moderationSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_USERS });
    return;
  }
  const reportId = requireReportId(id);
  await db.report.updateMany({
    where: { id: reportId },
    data: { resolvedAt: null, resolvedBy: null, resolvedByUserId: null },
  });
  revalidatePath("/admin/reports");
  await setAdminFlash({
    message: "Report reopened.",
    undo: { label: "Undo", action: "resolve_report", ids: [reportId] },
  });
}
