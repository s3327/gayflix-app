import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { canManageJobs } from "@/lib/admin-roles";
import { logActivity } from "@/lib/activity-logger";

export type JobName = "purge_trash" | "publish_due" | "clean_orphans";

export const AVAILABLE_JOBS: {
  name: JobName;
  label: string;
  description: string;
  schedule: string;
}[] = [
  {
    name: "purge_trash",
    label: "30-Day Trash Auto-Purge",
    description: "Permanently deletes movies and series that have been in the trash for longer than 30 days.",
    schedule: "Daily at 03:00 UTC",
  },
  {
    name: "publish_due",
    label: "Publish Due Scheduled Drafts",
    description: "Publishes draft titles whose Publish at time has come.",
    schedule: "Daily at 03:15 UTC",
  },
  {
    name: "clean_orphans",
    label: "Scan Unreferenced Uploads (Preview)",
    description: "Preview scanner for unreferenced blob uploads. Real blob bucket scanning requires dedicated storage worker.",
    schedule: "Manual only",
  },
];

/** Measures database latency and checks system status. */
export async function getSystemHealth() {
  const start = performance.now();
  let dbLatencyMs = -1;
  let dbStatus = "healthy";

  try {
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Math.round(performance.now() - start);
  } catch (err) {
    dbStatus = "error";
    console.error("DB health check failed:", err);
  }

  const [totalMedia, totalUsers, totalReports, activeSettings] = await Promise.all([
    db.media.count({ where: { trashedAt: null } }).catch(() => 0),
    db.user.count().catch(() => 0),
    db.report.count({ where: { resolvedAt: null } }).catch(() => 0),
    db.siteSetting.findUnique({ where: { id: "default" } }).catch(() => null),
  ]);

  return {
    dbStatus,
    dbLatencyMs,
    totalMedia,
    totalUsers,
    totalReports,
    maintenanceMode: activeSettings?.maintenanceMode ?? false,
    registrationOpen: activeSettings?.registrationOpen ?? true,
    nodeEnv: process.env.NODE_ENV || "development",
  };
}

/** Fetches recent job runs. */
export async function listJobRuns(limit = 20) {
  return db.scheduledJobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

/** Purges items trashed for > 30 days. */
export async function runTrashPurgeJob(triggeredBy = "scheduler") {
  const startTime = Date.now();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const expired = await db.media.findMany({
      where: { trashedAt: { lte: thirtyDaysAgo } },
      select: { id: true, title: true },
    });

    if (expired.length > 0) {
      await db.media.deleteMany({
        where: { id: { in: expired.map((m) => m.id) } },
      });
    }

    const durationMs = Date.now() - startTime;
    const run = await db.scheduledJobRun.create({
      data: {
        jobName: "purge_trash",
        status: "success",
        itemsCount: expired.length,
        details: expired.length > 0 ? `Purged ${expired.length} expired titles.` : "No titles eligible for purge.",
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      },
    });

    return run;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    await db.scheduledJobRun.create({
      data: {
        jobName: "purge_trash",
        status: "error",
        itemsCount: 0,
        details: `Failed: ${msg}`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}

/**
 * Publishes drafts whose "Publish at" (publishAt) has come. publishedAt
 * isn't a schedule: an unpublished title keeps it, and must stay a draft.
 */
export async function runPublishDueJob(triggeredBy = "scheduler") {
  const startTime = Date.now();
  const now = new Date();

  try {
    const due = await db.media.findMany({
      where: { status: "draft", trashedAt: null, publishAt: { lte: now } },
      select: { id: true, publishedAt: true, publishAt: true },
    });

    await db.$transaction(
      due.map((m) =>
        db.media.update({
          where: { id: m.id, status: "draft", trashedAt: null },
          data: { status: "published", publishAt: null, publishedAt: m.publishedAt ?? m.publishAt },
        })
      )
    );

    const durationMs = Date.now() - startTime;
    const run = await db.scheduledJobRun.create({
      data: {
        jobName: "publish_due",
        status: "success",
        itemsCount: due.length,
        details: due.length > 0 ? `Auto-published ${due.length} scheduled titles.` : "No scheduled titles due.",
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      },
    });

    return run;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    await db.scheduledJobRun.create({
      data: {
        jobName: "publish_due",
        status: "error",
        itemsCount: 0,
        details: `Failed: ${msg}`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}

/** Scans unreferenced uploads (preview/skipped). */
export async function runOrphanImageCleanupJob(triggeredBy = "scheduler") {
  const startTime = Date.now();
  const durationMs = Date.now() - startTime;
  return db.scheduledJobRun.create({
    data: {
      jobName: "clean_orphans",
      status: "skipped",
      itemsCount: 0,
      details: "Scan skipped: blob scanning requires dedicated background worker.",
      durationMs,
      triggeredBy,
      finishedAt: new Date(),
    },
  });
}

/** Server action to manually trigger a background job. */
export async function triggerJob(jobName: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdmin();
  if (!canManageJobs(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to trigger background jobs." };
  }

  let result;
  if (jobName === "purge_trash") {
    result = await runTrashPurgeJob(session.user.email);
  } else if (jobName === "publish_due") {
    result = await runPublishDueJob(session.user.email);
  } else if (jobName === "clean_orphans") {
    result = await runOrphanImageCleanupJob(session.user.email);
  } else {
    return { ok: false, message: "Unknown job name." };
  }

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "job.run",
    entityType: "job",
    entityId: jobName,
    summary: `Manually executed job '${jobName}' (${result.itemsCount} items processed)`,
    details: { durationMs: result.durationMs, details: result.details },
  });

  revalidatePath("/", "layout");
  return { ok: true, message: `Job '${jobName}' completed: ${result.details}` };
}
