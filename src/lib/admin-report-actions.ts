"use server";

import { revalidatePath } from "next/cache";
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
  await db.report.updateMany({
    where: { id: requireReportId(id), resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedBy: session.user.email },
  });
  revalidatePath("/admin/reports");
}

export async function reopenReport(id: unknown): Promise<void> {
  await requireAdmin();
  await db.report.updateMany({
    where: { id: requireReportId(id) },
    data: { resolvedAt: null, resolvedBy: null },
  });
  revalidatePath("/admin/reports");
}
