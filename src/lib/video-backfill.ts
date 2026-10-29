"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const dryRun = Boolean(options.dryRun);

  // 1. Process movies
  const movies = await db.media.findMany({
    where: {
      type: "movie",
      trashedAt: null,
    },
    select: {
      id: true,
      imdbId: true,
      tmdbId: true,
      videoSources: {
        select: { id: true, url: true },
      },
    },
  });

  let moviesUpdated = 0;
  for (const movie of movies) {
    if (movie.videoSources.length === 0) {
      const defaultUrl = buildDefaultMovieEmbedUrl({
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
      });

      if (defaultUrl) {
        if (!dryRun) {
          await db.videoSource.create({
            data: {
              mediaId: movie.id,
              label: "Server 1",
              kind: "embed",
              url: defaultUrl,
              position: 1,
              enabled: true,
            },
          });
        }
        moviesUpdated++;
      }
    }
  }

  // 2. Process episodes
  const episodes = await db.episode.findMany({
    where: {
      media: {
        trashedAt: null,
      },
    },
    select: {
      id: true,
      seasonNumber: true,
      episodeNumber: true,
      media: {
        select: {
          imdbId: true,
          tmdbId: true,
        },
      },
      videoSources: {
        select: { id: true, url: true },
      },
    },
  });

  let episodesUpdated = 0;
  for (const ep of episodes) {
    if (ep.videoSources.length === 0) {
      const defaultUrl = buildDefaultEpisodeEmbedUrl({
        imdbId: ep.media.imdbId,
        tmdbId: ep.media.tmdbId,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
      });

      if (defaultUrl) {
        if (!dryRun) {
          await db.videoSource.create({
            data: {
              episodeId: ep.id,
              label: "Server 1",
              kind: "embed",
              url: defaultUrl,
              position: 1,
              enabled: true,
            },
          });
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
  options: BackfillOptions = {}
): Promise<{ ok: boolean; message: string; result?: BackfillResult }> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    return { ok: false, message: FORBIDDEN_CATALOG };
  }

  const result = await backfillDefaultVideoSources(options);

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
