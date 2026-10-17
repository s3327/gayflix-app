import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { MediaType } from "@/lib/media";
import { gradientFor, movieDuration, seriesDuration, slugify, type TitleInput } from "@/lib/title-form";

/*
 * Writes shared by the admin title editor (src/lib/admin-catalog-actions.ts)
 * and the Import page (src/lib/admin-import-actions.ts). Server code only,
 * called from server functions that have already checked for an admin.
 */

export type Tx = Prisma.TransactionClient;

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** The base address, or base-2, base-3...: one no title or episode has. */
export async function freeId(base: string) {
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const [media, episode] = await Promise.all([
      db.media.findUnique({ where: { id }, select: { id: true } }),
      db.episode.findUnique({ where: { id }, select: { id: true } }),
    ]);
    if (!media && !episode) return id;
  }
}

/** Only one title is featured: the home page's hero. */
export async function unfeatureOthers(tx: Tx, id: string) {
  // Raw, so the others' updatedAt (and their place in listings) stays.
  await tx.$executeRaw`UPDATE media SET featured = false WHERE featured AND id <> ${id}`;
}

export function titleData(type: MediaType, input: TitleInput) {
  return {
    title: input.title,
    year: input.year,
    releaseDate: input.releaseDate,
    genres: input.genres,
    country: input.country,
    language: input.language,
    synopsis: input.synopsis,
    tagline: input.tagline,
    rating: input.rating,
    director: type === "movie" ? input.credit : null,
    creator: type === "series" ? input.credit : null,
    cast: input.cast,
    tags: input.tags,
    posterUrl: input.posterUrl,
    backdropUrl: input.backdropUrl,
    status: input.status,
    // Publishing now replaces a schedule.
    publishAt: input.status === "published" ? null : input.publishAt,
    featured: input.featured,
    ...(type === "movie" && {
      runtimeMinutes: input.runtimeMinutes,
      duration: movieDuration(input.runtimeMinutes!),
    }),
  } satisfies Prisma.MediaUpdateInput;
}

/** Where an imported title came from (media.tmdbId and media.imdbId). */
export type SourceIds = { tmdbId: string | null; imdbId: string | null };

/**
 * Adds a title, at an address made from its name. Returns the address,
 * or null when another title took the address or the source ids just now.
 */
export async function insertTitle(
  type: MediaType,
  input: TitleInput,
  { tmdbId, imdbId }: SourceIds = { tmdbId: null, imdbId: null }
): Promise<string | null> {
  const id = await freeId(slugify(input.title) || type);
  try {
    await db.$transaction(async (tx) => {
      if (input.featured && input.status === "published") await unfeatureOthers(tx, id);
      await tx.media.create({
        data: {
          id,
          type,
          ...titleData(type, input),
          publishedAt: input.status === "published" ? new Date() : null,
          // A series' seasons come from its episodes, and it has none yet.
          duration: type === "movie" ? movieDuration(input.runtimeMinutes!) : seriesDuration(0),
          gradient: gradientFor(id),
          tmdbId,
          imdbId,
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return null;
  }
  return id;
}
