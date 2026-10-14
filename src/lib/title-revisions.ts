import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { canManageCatalog } from "@/lib/admin-roles";
import { logActivity } from "@/lib/activity-logger";
import type { Prisma } from "@/generated/prisma/client";

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
};

/**
 * Creates a point-in-time snapshot before title metadata is changed.
 */
export async function createTitleRevision({
  mediaId,
  actorId,
  actorEmail,
  summary,
}: {
  mediaId: string;
  actorId?: string | null;
  actorEmail: string;
  summary: string;
}) {
  try {
    const existing = await db.media.findUnique({
      where: { id: mediaId },
    });
    if (!existing) return;

    const snapshot: TitleSnapshot = {
      title: existing.title,
      year: existing.year,
      duration: existing.duration,
      status: existing.status,
      genres: existing.genres,
      country: existing.country,
      language: existing.language,
      synopsis: existing.synopsis,
      tagline: existing.tagline,
      rating: existing.rating,
      director: existing.director,
      creator: existing.creator,
      cast: existing.cast,
      tags: existing.tags,
      posterUrl: existing.posterUrl,
      backdropUrl: existing.backdropUrl,
      backdropFocus: existing.backdropFocus,
    };

    await db.titleRevision.create({
      data: {
        mediaId,
        actorId: actorId ?? null,
        actorEmail,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        summary,
      },
    });

    // Prune revisions older than latest 30 to prevent unbounded growth
    const oldRevisions = await db.titleRevision.findMany({
      where: { mediaId },
      orderBy: { createdAt: "desc" },
      skip: 30,
      select: { id: true },
    });
    if (oldRevisions.length > 0) {
      await db.titleRevision.deleteMany({
        where: { id: { in: oldRevisions.map((r) => r.id) } },
      });
    }
  } catch (err) {
    console.error("Failed to create title revision snapshot:", err);
  }
}

/** Fetches revision history for a media item. */
export async function getTitleRevisions(mediaId: string) {
  return db.titleRevision.findMany({
    where: { mediaId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** Restores a title to a previous snapshot revision. */
export async function rollbackTitleRevision(revisionId: string): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageCatalog(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to edit catalog titles." };
  }

  const revision = await db.titleRevision.findUnique({
    where: { id: revisionId },
    include: { media: true },
  });

  if (!revision || !revision.media) {
    return { ok: false, message: "Revision not found." };
  }

  const snap = revision.snapshot as unknown as TitleSnapshot;
  if (!snap || !snap.title) {
    return { ok: false, message: "Invalid revision snapshot data." };
  }

  // Create a revision of the current state before rolling back
  await createTitleRevision({
    mediaId: revision.mediaId,
    actorId: session.user.id,
    actorEmail: session.user.email,
    summary: `Pre-rollback snapshot before restoring revision from ${new Date(revision.createdAt).toLocaleDateString()}`,
  });

  await db.media.update({
    where: { id: revision.mediaId },
    data: {
      title: snap.title,
      year: snap.year,
      duration: snap.duration,
      status: snap.status as "draft" | "published",
      genres: snap.genres,
      country: snap.country,
      language: snap.language,
      synopsis: snap.synopsis,
      tagline: snap.tagline ?? null,
      rating: snap.rating ?? null,
      director: snap.director ?? null,
      creator: snap.creator ?? null,
      cast: snap.cast,
      tags: snap.tags,
      posterUrl: snap.posterUrl,
      backdropUrl: snap.backdropUrl ?? null,
      backdropFocus: snap.backdropFocus ?? null,
    },
  });

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
