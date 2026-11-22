"use server";

import { revalidatePath } from "next/cache";
import type { Kysely } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { logActivity } from "@/lib/activity-logger";
import {
  buildDefaultMovieEmbedUrl,
  buildDefaultEpisodeEmbedUrl,
} from "@/lib/embed-builder";

export interface BackfillOptions {
  dryRun?: boolean;
}

export interface BackfillResult {
  moviesProcessed: number;
  moviesUpdated: number;
  episodesProcessed: number;
  episodesUpdated: number;
  dryRun: boolean;
}

/**
 * Scans all movies and series episodes in the database.
 * If any movie or episode does not have a video source, it generates
 * and inserts the default gayflix embed video source ("Server 1").
 */
export async function backfillDefaultVideoSources(
  options: BackfillOptions = {},
  executor: Kysely<DB> = database
): Promise<BackfillResult> {
  const dryRun = Boolean(options.dryRun);

  // 1. Process movies
  const movies = await executor
    .selectFrom("media")
    .select(["id", "imdbId", "tmdbId"])
    .select((eb) => [
      jsonArrayFrom(
        eb.selectFrom("video_source").select(["id", "url"]).whereRef("video_source.mediaId", "=", "media.id")
      ).as("videoSources"),
    ])
    .where("type", "=", "movie")
    .where("trashedAt", "is", null)
    .execute();

  let moviesUpdated = 0;
  for (const movie of movies) {
    if ((movie.videoSources ?? []).length === 0) {
      const defaultUrl = buildDefaultMovieEmbedUrl({
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
      });

      if (defaultUrl) {
        if (!dryRun) {
          await executor
            .insertInto("video_source")
            .values({
              mediaId: movie.id,
              label: "Server 1",
              kind: "embed",
              url: defaultUrl,
              position: 1,
              enabled: true,
            })
            .execute();
        }
        moviesUpdated++;
      }
    }
  }

  // 2. Process episodes
  const episodes = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select([
      "episode.id",
      "episode.seasonNumber",
      "episode.episodeNumber",
      "media.imdbId",
      "media.tmdbId",
    ])
    .select((eb) => [
      jsonArrayFrom(
        eb.selectFrom("video_source").select(["id", "url"]).whereRef("video_source.episodeId", "=", "episode.id")
      ).as("videoSources"),
    ])
    .where("media.trashedAt", "is", null)
    .execute();

  let episodesUpdated = 0;
  for (const ep of episodes) {
    if ((ep.videoSources ?? []).length === 0) {
      const defaultUrl = buildDefaultEpisodeEmbedUrl({
        imdbId: ep.imdbId,
        tmdbId: ep.tmdbId,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
      });

      if (defaultUrl) {
        if (!dryRun) {
          await executor
            .insertInto("video_source")
            .values({
              episodeId: ep.id,
              label: "Server 1",
              kind: "embed",
              url: defaultUrl,
              position: 1,
              enabled: true,
            })
            .execute();
        }
        episodesUpdated++;
      }
    }
  }

  return {
    moviesProcessed: movies.length,
    moviesUpdated,
    episodesProcessed: episodes.length,
    episodesUpdated,
    dryRun,
  };
}

/**
 * Admin action to trigger backfill with authentication and audit logging.
 */
export async function backfillDefaultVideoSourcesAction(
  options: BackfillOptions = {},
  executor: Kysely<DB> = database
): Promise<{ ok: boolean; message: string; result?: BackfillResult }> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    return { ok: false, message: FORBIDDEN_CATALOG };
  }

  const result = await backfillDefaultVideoSources(options, executor);

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "video.backfill_default_sources",
    entityType: "job",
    summary: `Backfilled default embed video sources (${result.moviesUpdated} movies, ${result.episodesUpdated} episodes updated)`,
    details: { ...result },
  });

  revalidatePath("/", "layout");

  const mode = result.dryRun ? "[Dry Run] " : "";
  return {
    ok: true,
    message: `${mode}Processed ${result.moviesProcessed} movies (${result.moviesUpdated} updated) and ${result.episodesProcessed} episodes (${result.episodesUpdated} updated).`,
    result,
  };
}
