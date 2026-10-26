import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
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
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const entry = await db.activityLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        summary: params.summary,
        details: (params.details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });

    // Fire webhook asynchronously if configured (do not await or block)
    dispatchWebhook(entry).catch(() => {
      // Ignore background webhook delivery errors
    });
  } catch (err) {
    // Avoid crashing primary flows on logging failures
    console.error("Failed to log activity:", err);
  }
}

async function dispatchWebhook(entry: {
  id: string;
  action: string;
  summary: string;
  actorEmail: string;
  createdAt: Date;
}) {
  try {
    const setting = await db.siteSetting.findUnique({
      where: { id: "default" },
      select: { webhookUrl: true },
    });
    if (!setting?.webhookUrl) return;

    // Checks the address it connects to, not just an earlier lookup.
    await postJsonToPublicUrl(setting.webhookUrl, {
      event: "activity.created",
      action: entry.action,
      summary: entry.summary,
      actor: entry.actorEmail,
      timestamp: entry.createdAt.toISOString(),
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

export async function listActivityLogs(filter: ActivityFilter = {}) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filter.pageSize ?? 30));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ActivityLogWhereInput = {};
  if (filter.actor) {
    where.actorEmail = { contains: filter.actor, mode: "insensitive" };
  }
  if (filter.action) {
    where.action = filter.action;
  }
  if (filter.entityType) {
    where.entityType = filter.entityType;
  }

  const [items, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.activityLog.count({ where }),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getEntityActivity(entityType: string, entityId: string, limit = 20) {
  return db.activityLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
