import type { Kysely, Transaction } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { countOf } from "@/lib/sql-helpers";
import { escapeLike } from "@/lib/search";
import { postJsonToPublicUrl } from "@/lib/safe-url";

export type LogActivityParams = {
  actorId?: string | null;
  actorEmail: string;
  actorRole?: string | null;
  action: string;
  entityType: "media" | "episode" | "user" | "report" | "setting" | "job" | "review" | "list" | "collection";
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
};

/**
 * Non-blocking activity logger. Persists event to Postgres and asynchronously
 * dispatches webhook if configured in site settings.
 */
export async function logActivity(
  params: LogActivityParams,
  executor: Kysely<DB> | Transaction<DB> = database
): Promise<void> {
  try {
    const entry = await executor
      .insertInto("activity_log")
      .values({
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        summary: params.summary,
        details: params.details ? JSON.stringify(params.details) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Fire webhook asynchronously if configured (do not await or block)
    dispatchWebhook(entry, executor).catch(() => {
      // Ignore background webhook delivery errors
    });
  } catch (err) {
    // Avoid crashing primary flows on logging failures
    console.error("Failed to log activity:", err);
  }
}

async function dispatchWebhook(
  entry: {
    id: string;
    action: string;
    summary: string;
    actorEmail: string;
    createdAt: Date | string;
  },
  executor: Kysely<DB> | Transaction<DB> = database
) {
  try {
    const setting = await executor
      .selectFrom("site_setting")
      .select("webhookUrl")
      .where("id", "=", "default")
      .executeTakeFirst();
    if (!setting?.webhookUrl) return;

    const timestamp =
      entry.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : new Date(entry.createdAt).toISOString();

    // Checks the address it connects to, not just an earlier lookup.
    await postJsonToPublicUrl(setting.webhookUrl, {
      event: "activity.created",
      action: entry.action,
      summary: entry.summary,
      actor: entry.actorEmail,
      timestamp,
    });
  } catch {
    // Ignore webhook errors
  }
}

export type ActivityFilter = {
  actor?: string;
  action?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
};

export async function listActivityLogs(
  filter: ActivityFilter = {},
  executor: Kysely<DB> | Transaction<DB> = database
) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filter.pageSize ?? 30));
  const skip = (page - 1) * pageSize;

  let query = executor.selectFrom("activity_log");
  let countQuery = executor.selectFrom("activity_log");

  if (filter.actor) {
    const pattern = `%${escapeLike(filter.actor)}%`;
    query = query.where("actorEmail", "ilike", pattern);
    countQuery = countQuery.where("actorEmail", "ilike", pattern);
  }
  if (filter.action) {
    query = query.where("action", "=", filter.action);
    countQuery = countQuery.where("action", "=", filter.action);
  }
  if (filter.entityType) {
    query = query.where("entityType", "=", filter.entityType);
    countQuery = countQuery.where("entityType", "=", filter.entityType);
  }

  const [items, countRow] = await Promise.all([
    query
      .selectAll()
      .orderBy("createdAt", "desc")
      .offset(skip)
      .limit(pageSize)
      .execute(),
    countQuery
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst(),
  ]);

  const total = countRow ? countOf(countRow) : 0;

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getEntityActivity(
  entityType: string,
  entityId: string,
  limit = 20,
  executor: Kysely<DB> | Transaction<DB> = database
) {
  return executor
    .selectFrom("activity_log")
    .selectAll()
    .where("entityType", "=", entityType)
    .where("entityId", "=", entityId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
}

export const getActivityLogs = listActivityLogs;
export const getRecentActivity = getEntityActivity;
