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

export async function resolveReport(id: unknown): Promise<void> {
  const session = await requireAdmin();
  const reportId = requireReportId(id);
  await db.report.updateMany({
    where: { id: reportId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedBy: session.user.email },
  });
  revalidatePath("/admin/reports");
  await setAdminFlash({
    message: "Report resolved.",
    undo: { label: "Undo", action: "reopen_report", ids: [reportId] },
  });
}

export async function reopenReport(id: unknown): Promise<void> {
  await requireAdmin();
  const reportId = requireReportId(id);
  await db.report.updateMany({
    where: { id: reportId },
    data: { resolvedAt: null, resolvedBy: null },
  });
  revalidatePath("/admin/reports");
  await setAdminFlash({
    message: "Report reopened.",
    undo: { label: "Undo", action: "resolve_report", ids: [reportId] },
  });
}
