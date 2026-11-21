import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import type { MediaType } from "@/lib/media";
import { gradientFor, movieDuration, seriesDuration, slugify, type TitleInput } from "@/lib/title-form";
import { buildDefaultMovieEmbedUrl } from "@/lib/embed-builder";

/*
 * Writes shared by the admin title editor (src/lib/admin-catalog-actions.ts)
 * and the Import page (src/lib/admin-import-actions.ts). Server code only,
 * called from server functions that have already checked for an admin.
 */

export type Tx = Transaction<DB> | Kysely<DB>;

function getExecutor(val: unknown): Kysely<DB> | Transaction<DB> {
  return typeof val === "object" && val !== null && "selectFrom" in val
    ? (val as Kysely<DB> | Transaction<DB>)
    : database;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

/** The base address, or base-2, base-3...: one no title or episode has. */
export async function freeId(base: string, executorOrUnknown?: Kysely<DB> | unknown): Promise<string> {
  const executor = getExecutor(executorOrUnknown);
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const [media, episode] = await Promise.all([
      executor
        .selectFrom("media")
        .select("id")
        .where("id", "=", id)
        .executeTakeFirst(),
      executor
        .selectFrom("episode")
        .select("id")
        .where("id", "=", id)
        .executeTakeFirst(),
    ]);
    if (!media && !episode) return id;
  }
}

/** Only one title is featured: the home page's hero. */
export async function unfeatureOthers(tx: Tx, id: string): Promise<void> {
  // Raw, so the others' updatedAt (and their place in listings) stays.
  await sql`UPDATE media SET featured = false WHERE featured AND id <> ${id}`.execute(tx);
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
    trailerUrl: input.trailerUrl,
    maturityRating: input.maturityRating,
    contentNotes: input.contentNotes,
    status: input.status,
    category: input.category ?? null,
    // Publishing now replaces a schedule.
    publishAt: input.status === "published" ? null : input.publishAt,
    featured: input.featured,
    ...(type === "movie" && {
      runtimeMinutes: input.runtimeMinutes,
      duration: movieDuration(input.runtimeMinutes!),
    }),
  };
}

/** Where an imported title came from (media.tmdbId and media.imdbId). */
export type SourceIds = {
  tmdbId?: string | null;
  imdbId?: string | null;
};

/**
 * Adds a title, at an address made from its name. Returns the address,
 * or null when another title took the address or the source ids just now.
 */
export async function insertTitle(
  type: MediaType,
  input: TitleInput,
  sources: SourceIds = {},
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<string | null> {
  const executor = getExecutor(executorOrUnknown);
  const id = await freeId(slugify(input.title) || type, executor);
  const rawTmdbId = sources.tmdbId ?? null;
  const tmdbId =
    rawTmdbId
      ? (String(rawTmdbId).startsWith("tmdb-") ? String(rawTmdbId) : `tmdb-${rawTmdbId}`)
      : null;
  const imdbId = sources.imdbId ?? null;

  try {
    const runInsert = async (tx: Transaction<DB> | Kysely<DB>) => {
      if (input.featured && input.status === "published") await unfeatureOthers(tx, id);
      await tx
        .insertInto("media")
        .values({
          id,
          type,
          ...titleData(type, input),
          publishedAt: input.status === "published" ? new Date() : null,
          // A series' seasons come from its episodes, and it has none yet.
          duration: type === "movie" ? movieDuration(input.runtimeMinutes!) : seriesDuration(0),
          gradient: gradientFor(id),
          tmdbId,
          imdbId,
        })
        .execute();

      if (type === "movie") {
        const defaultEmbedUrl = buildDefaultMovieEmbedUrl({
          imdbId,
          tmdbId: rawTmdbId ?? tmdbId,
        });
        if (defaultEmbedUrl) {
          await tx
            .insertInto("video_source")
            .values({
              mediaId: id,
              label: "Server 1",
              kind: "embed",
              url: defaultEmbedUrl,
              position: 1,
              enabled: true,
            })
            .execute();
        }
      }
    };

    if (executor.isTransaction) {
      await runInsert(executor);
    } else {
      await executor.transaction().execute(runInsert);
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return null;
  }
  return id;
}
