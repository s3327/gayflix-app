import type { Kysely } from "kysely";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { canManageCatalog } from "@/lib/admin-roles";
import { logActivity } from "@/lib/activity-logger";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { movieDurationMinutes, parseTitle, titleValues } from "@/lib/title-form";
import { titleData } from "@/lib/title-store";

export type TitleSnapshot = {
  title: string;
  year: number;
  duration: string;
  status: string;
  genres: string[];
  country: string;
  language: string;
  synopsis: string;
  tagline?: string | null;
  rating?: number | null;
  director?: string | null;
  creator?: string | null;
  cast: string[];
  tags: string[];
  posterUrl: string;
  backdropUrl?: string | null;
  backdropFocus?: string | null;
  trailerUrl?: string | null;
  maturityRating?: string | null;
  contentNotes?: string[];
};

function getExecutor(val: unknown): Kysely<DB> {
  return typeof val === "object" && val !== null && "selectFrom" in val
    ? (val as Kysely<DB>)
    : database;
}

/**
 * Creates a point-in-time snapshot before title metadata is changed.
 */
export async function createTitleRevision(
  {
    mediaId,
    actorId,
    actorEmail,
    summary,
  }: {
    mediaId: string;
    actorId?: string | null;
    actorEmail: string;
    summary: string;
  },
  executor: Kysely<DB> = database
) {
  try {
    const existing = await executor
      .selectFrom("media")
      .selectAll()
      .where("id", "=", mediaId)
      .executeTakeFirst();
    if (!existing) return;

    const snapshot: TitleSnapshot = {
      title: existing.title,
      year: existing.year,
      duration: existing.duration,
      status: existing.status,
      genres: existing.genres ?? [],
      country: existing.country,
      language: existing.language,
      synopsis: existing.synopsis,
      tagline: existing.tagline,
      rating: existing.rating,
      director: existing.director,
      creator: existing.creator,
      cast: existing.cast ?? [],
      tags: existing.tags ?? [],
      posterUrl: existing.posterUrl,
      backdropUrl: existing.backdropUrl,
      backdropFocus: existing.backdropFocus,
      trailerUrl: existing.trailerUrl,
      maturityRating: existing.maturityRating,
      contentNotes: existing.contentNotes ?? [],
    };

    await executor
      .insertInto("title_revision")
      .values({
        mediaId,
        actorId: actorId ?? null,
        actorEmail,
        snapshot: JSON.stringify(snapshot),
        summary,
      })
      .execute();

    // Prune revisions older than latest 30 to prevent unbounded growth
    const oldRevisions = await executor
      .selectFrom("title_revision")
      .select("id")
      .where("mediaId", "=", mediaId)
      .orderBy("createdAt", "desc")
      .offset(30)
      .execute();
    if (oldRevisions.length > 0) {
      await executor
        .deleteFrom("title_revision")
        .where(
          "id",
          "in",
          oldRevisions.map((r) => r.id)
        )
        .execute();
    }
  } catch (err) {
    console.error("Failed to create title revision snapshot:", err);
  }
}

/** Fetches revision history for a media item. */
export async function getTitleRevisions(mediaId: string, executor: Kysely<DB> = database) {
  const rows = await executor
    .selectFrom("title_revision")
    .selectAll()
    .where("mediaId", "=", mediaId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .execute();
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
  }));
}

/** Prisma's cuid() ids. */
function isRevisionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{20,40}$/.test(value);
}

/**
 * A stored snapshot laid over the title as it is now. A field the
 * snapshot doesn't have, or has in the wrong shape, keeps today's value.
 */
function snapshotOver<T extends Record<string, unknown>>(current: T, snapshot: unknown): T {
  let snap: Record<string, unknown> = {};
  if (typeof snapshot === "string") {
    try {
      snap = JSON.parse(snapshot);
    } catch {
      snap = {};
    }
  } else if (typeof snapshot === "object" && snapshot !== null) {
    snap = snapshot as Record<string, unknown>;
  }

  const merged: Record<string, unknown> = { ...current };
  for (const key of Object.keys(current)) {
    if (!(key in snap)) continue;
    const now = current[key];
    const then = snap[key];
    const sameShape = Array.isArray(now)
      ? Array.isArray(then) && then.every((item) => typeof item === "string")
      : then === null || typeof then === typeof now || now === null;
    if (sameShape) merged[key] = then;
  }
  return merged as T;
}

/**
 * Restores a title's details to a previous snapshot revision. The
 * restored details go through the title form's checks, and the title
 * keeps its current status and Featured flag: restoring never publishes,
 * unpublishes or features anything.
 */
export async function rollbackTitleRevision(
  revisionId: unknown,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<{ ok: boolean; message?: string }> {
  const executor = getExecutor(executorOrUnknown);
  const session = await requireAdmin();
  if (!canManageCatalog(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to edit catalog titles." };
  }
  if (!isRevisionId(revisionId)) return { ok: false, message: "Revision not found." };

  const revision = await executor
    .selectFrom("title_revision")
    .selectAll()
    .where("id", "=", revisionId)
    .executeTakeFirst();

  if (!revision) {
    return { ok: false, message: "Revision not found." };
  }

  const media = await executor
    .selectFrom("media")
    .selectAll()
    .where("id", "=", revision.mediaId)
    .executeTakeFirst();

  if (!media) {
    return { ok: false, message: "Revision not found." };
  }
  if (media.trashedAt) {
    return { ok: false, message: "This title is in the trash. Restore it from the trash first." };
  }

  const restored = snapshotOver(
    {
      title: media.title,
      year: media.year,
      duration: media.duration,
      genres: media.genres ?? [],
      country: media.country,
      language: media.language,
      synopsis: media.synopsis,
      tagline: media.tagline,
      rating: media.rating,
      director: media.director,
      creator: media.creator,
      cast: media.cast ?? [],
      tags: media.tags ?? [],
      posterUrl: media.posterUrl,
      backdropUrl: media.backdropUrl,
      backdropFocus: media.backdropFocus,
      trailerUrl: media.trailerUrl,
      maturityRating: media.maturityRating,
      contentNotes: media.contentNotes ?? [],
    },
    revision.snapshot
  );
  const parsed = parseTitle(
    media.type,
    titleValues({
      ...media,
      ...restored,
      genres: restored.genres,
      cast: restored.cast,
      tags: restored.tags,
      contentNotes: restored.contentNotes ?? [],
      runtimeMinutes: media.type === "movie" ? movieDurationMinutes(restored.duration) : null,
    })
  );
  if (!parsed.ok) {
    const [problem] = Object.values(parsed.errors);
    return { ok: false, message: `That revision can't be restored. ${problem}` };
  }

  // Create a revision of the current state before rolling back
  await createTitleRevision(
    {
      mediaId: revision.mediaId,
      actorId: session.user.id,
      actorEmail: session.user.email,
      summary: `Pre-rollback snapshot before restoring revision from ${new Date(revision.createdAt).toLocaleDateString()}`,
    },
    executor
  );

  const updateResult = await executor
    .updateTable("media")
    .set({
      ...titleData(media.type, parsed.data),
      ...(media.type === "series" ? { duration: media.duration } : {}),
      backdropFocus: restored.backdropFocus,
      updatedAt: new Date(),
    })
    .where("id", "=", revision.mediaId)
    .where("trashedAt", "is", null)
    .executeTakeFirst();

  if (Number(updateResult.numUpdatedRows) === 0) {
    return { ok: false, message: "This title is in the trash. Restore it from the trash first." };
  }
  const snap = parsed.data;

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.rollback",
    entityType: "media",
    entityId: revision.mediaId,
    summary: `Rolled back '${snap.title}' to revision from ${new Date(revision.createdAt).toLocaleString()}`,
    details: { revisionId, restoredTitle: snap.title },
  });

  revalidatePath("/", "layout");
  return { ok: true, message: `Restored to revision from ${new Date(revision.createdAt).toLocaleDateString()}.` };
}
