"use server";

import { revalidatePath } from "next/cache";
import { setAdminFlash } from "@/lib/admin-flash";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

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
  const session = await requireAdmin();
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

/** Resolves all open reports for a given title or episode, optionally disabling video sources. */
export async function resolveAllForMedia({
  mediaId,
  disableSources = false,
  notes,
}: {
  mediaId: string;
  disableSources?: boolean;
  notes?: string;
}): Promise<{ ok: boolean; resolvedCount: number }> {
  const session = await requireAdmin();
  if (!mediaId) return { ok: false, resolvedCount: 0 };

  if (disableSources) {
    await db.videoSource.updateMany({
      where: {
        OR: [{ mediaId }, { episodeId: mediaId }],
      },
      data: { enabled: false },
    });
  }

  const { count } = await db.report.updateMany({
    where: { mediaId, resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolvedBy: session.user.email,
      resolvedByUserId: session.user.id,
      notes: notes?.trim() || null,
    },
  });

  revalidatePath("/admin/reports");
  revalidatePath("/admin/library/movies");
  revalidatePath("/admin/library/series");
  revalidatePath("/admin/library/episodes");

  await setAdminFlash({
    message: `Resolved ${count} ${count === 1 ? "report" : "reports"}${
      disableSources ? " and disabled broken video source" : ""
    }.`,
  });

  return { ok: true, resolvedCount: count };
}

export async function reopenReport(id: unknown, _formData?: unknown): Promise<void> {
  void _formData;
  await requireAdmin();
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
