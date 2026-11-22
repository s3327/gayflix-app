import { revalidatePath } from "next/cache";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { countOf } from "@/lib/sql-helpers";
import { requireAdmin } from "@/lib/session";
import { canManageJobs } from "@/lib/admin-roles";
import { logActivity } from "@/lib/activity-logger";
import { countAccounts } from "@/lib/user-admin-store";
import { backfillDefaultVideoSources } from "@/lib/video-backfill";

export type JobName = "purge_trash" | "publish_due" | "clean_orphans" | "backfill_default_embeds";

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
  {
    name: "backfill_default_embeds",
    label: "Backfill Default Embed Video Sources",
    description: "Populates missing default embed sources (Server 1) for movies and episodes with IMDb or TMDB IDs.",
    schedule: "Manual only",
  },
];

/** Measures database latency and checks system status. */
export async function getSystemHealth(
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const start = performance.now();
  let dbLatencyMs = -1;
  let dbStatus = "healthy";

  try {
    await sql`SELECT 1`.execute(executor);
    dbLatencyMs = Math.round(performance.now() - start);
  } catch (err) {
    dbStatus = "error";
    console.error("DB health check failed:", err);
  }

  const [totalMedia, totalUsers, totalReports, activeSettings] = await Promise.all([
    executor
      .selectFrom("media")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("trashedAt", "is", null)
      .executeTakeFirst()
      .then((row) => (row ? countOf(row) : 0))
      .catch(() => 0),
    countAccounts().catch(() => 0),
    executor
      .selectFrom("report")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("resolvedAt", "is", null)
      .executeTakeFirst()
      .then((row) => (row ? countOf(row) : 0))
      .catch(() => 0),
    executor
      .selectFrom("site_setting")
      .select(["maintenanceMode", "registrationOpen"])
      .where("id", "=", "default")
      .executeTakeFirst()
      .catch(() => null),
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

export const healthCheck = getSystemHealth;

/** Fetches recent job runs. */
export async function listJobRuns(
  limit = 20,
  executor: Kysely<DB> | Transaction<DB> = database
) {
  return executor
    .selectFrom("scheduled_job_run")
    .selectAll()
    .orderBy("startedAt", "desc")
    .limit(limit)
    .execute();
}

/** Purges items trashed for > 30 days. */
export async function runTrashPurgeJob(
  triggeredBy = "scheduler",
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const startTime = Date.now();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const expired = await executor
      .selectFrom("media")
      .select(["id", "title"])
      .where("trashedAt", "<=", thirtyDaysAgo)
      .execute();

    if (expired.length > 0) {
      await executor
        .deleteFrom("media")
        .where(
          "id",
          "in",
          expired.map((m) => m.id)
        )
        .execute();
    }

    const durationMs = Date.now() - startTime;
    const run = await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "purge_trash",
        status: "success",
        itemsCount: expired.length,
        details: expired.length > 0 ? `Purged ${expired.length} expired titles.` : "No titles eligible for purge.",
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return run;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "purge_trash",
        status: "error",
        itemsCount: 0,
        details: `Failed: ${msg}`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .execute();
    throw err;
  }
}

export const purgeTrash = runTrashPurgeJob;

/**
 * Publishes drafts whose "Publish at" (publishAt) has come. publishedAt
 * isn't a schedule: an unpublished title keeps it, and must stay a draft.
 */
export async function runPublishDueJob(
  triggeredBy = "scheduler",
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const startTime = Date.now();
  const now = new Date();

  try {
    const due = await executor
      .selectFrom("media")
      .select(["id", "publishedAt", "publishAt"])
      .where("status", "=", "draft")
      .where("trashedAt", "is", null)
      .where("publishAt", "<=", now)
      .execute();

    const applyUpdates = async (tx: Kysely<DB> | Transaction<DB>) => {
      for (const m of due) {
        await tx
          .updateTable("media")
          .set({
            status: "published",
            publishAt: null,
            publishedAt: m.publishedAt ?? m.publishAt,
          })
          .where("id", "=", m.id)
          .where("status", "=", "draft")
          .where("trashedAt", "is", null)
          .execute();
      }
    };

    if (executor.isTransaction) {
      await applyUpdates(executor);
    } else {
      await executor.transaction().execute(async (tx) => {
        await applyUpdates(tx);
      });
    }

    const durationMs = Date.now() - startTime;
    const run = await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "publish_due",
        status: "success",
        itemsCount: due.length,
        details: due.length > 0 ? `Auto-published ${due.length} scheduled titles.` : "No scheduled titles due.",
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return run;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "publish_due",
        status: "error",
        itemsCount: 0,
        details: `Failed: ${msg}`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .execute();
    throw err;
  }
}

export const publishScheduled = runPublishDueJob;

/** Scans unreferenced uploads (preview/skipped). */
export async function runOrphanImageCleanupJob(
  triggeredBy = "scheduler",
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const startTime = Date.now();
  const durationMs = Date.now() - startTime;
  return executor
    .insertInto("scheduled_job_run")
    .values({
      jobName: "clean_orphans",
      status: "skipped",
      itemsCount: 0,
      details: "Scan skipped: blob scanning requires dedicated background worker.",
      durationMs,
      triggeredBy,
      finishedAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function runBackfillDefaultEmbedsJob(
  triggeredBy = "scheduler",
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const startTime = Date.now();
  try {
    const res = await backfillDefaultVideoSources();
    const durationMs = Date.now() - startTime;
    const itemsCount = res.moviesUpdated + res.episodesUpdated;
    const details = `Updated ${res.moviesUpdated} movies and ${res.episodesUpdated} episodes (processed ${res.moviesProcessed} movies, ${res.episodesProcessed} episodes).`;
    const run = await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "backfill_default_embeds",
        status: "success",
        itemsCount,
        details,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return run;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "backfill_default_embeds",
        status: "error",
        itemsCount: 0,
        details: `Failed: ${msg}`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .execute();
    throw err;
  }
}

/** Prunes activity logs older than retention period. */
export async function pruneActivityLogs(
  retentionDays = 90,
  triggeredBy = "scheduler",
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const startTime = Date.now();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  try {
    const deleted = await executor
      .deleteFrom("activity_log")
      .where("createdAt", "<", cutoff)
      .executeTakeFirst();
    const count = Number(deleted.numDeletedRows ?? 0);
    const durationMs = Date.now() - startTime;
    const run = await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "prune_activity_logs",
        status: "success",
        itemsCount: count,
        details: `Pruned ${count} activity logs older than ${retentionDays} days.`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return run;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    await executor
      .insertInto("scheduled_job_run")
      .values({
        jobName: "prune_activity_logs",
        status: "error",
        itemsCount: 0,
        details: `Failed: ${msg}`,
        durationMs,
        triggeredBy,
        finishedAt: new Date(),
      })
      .execute();
    throw err;
  }
}

/** Revalidates public sitemap. */
export async function refreshSitemap(
  triggeredBy = "scheduler",
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const startTime = Date.now();
  revalidatePath("/sitemap.xml");
  const durationMs = Date.now() - startTime;
  return executor
    .insertInto("scheduled_job_run")
    .values({
      jobName: "refresh_sitemap",
      status: "success",
      itemsCount: 1,
      details: "Sitemap revalidated.",
      durationMs,
      triggeredBy,
      finishedAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Server action to manually trigger a background job. */
export async function triggerJob(
  jobName: string,
  executor: Kysely<DB> | Transaction<DB> = database
): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdmin();
  if (!canManageJobs(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to trigger background jobs." };
  }

  let result;
  if (jobName === "purge_trash") {
    result = await runTrashPurgeJob(session.user.email, executor);
  } else if (jobName === "publish_due") {
    result = await runPublishDueJob(session.user.email, executor);
  } else if (jobName === "clean_orphans") {
    result = await runOrphanImageCleanupJob(session.user.email, executor);
  } else if (jobName === "backfill_default_embeds") {
    result = await runBackfillDefaultEmbedsJob(session.user.email, executor);
  } else if (jobName === "prune_activity_logs") {
    result = await pruneActivityLogs(90, session.user.email, executor);
  } else if (jobName === "refresh_sitemap") {
    result = await refreshSitemap(session.user.email, executor);
  } else {
    return { ok: false, message: "Unknown job name." };
  }

  await logActivity(
    {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: "job.run",
      entityType: "job",
      entityId: jobName,
      summary: `Manually executed job '${jobName}' (${result.itemsCount} items processed)`,
      details: { durationMs: result.durationMs, details: result.details },
    },
    executor
  );

  revalidatePath("/", "layout");
  return { ok: true, message: `Job '${jobName}' completed: ${result.details}` };
}
