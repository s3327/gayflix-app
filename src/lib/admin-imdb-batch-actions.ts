"use server";

import { revalidatePath } from "next/cache";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { getSiteSettings } from "@/lib/site-settings";
import { db } from "@/lib/db";
import { imageHosts } from "@/lib/image-hosts.mjs";
import {
  fillGaps,
  formatTmdbRef,
  omdbValues,
  tmdbValues,
  type TmdbKind,
} from "@/lib/import-mapping";
import type { ImdbImportItem } from "@/lib/imdb-csv";
import { getOmdbById, omdbConfigured } from "@/lib/omdb";
import { findOnTmdb, getTmdbDetails } from "@/lib/tmdb";
import { parseTitle } from "@/lib/title-form";
import { insertTitle, isUniqueViolation } from "@/lib/title-store";

export type ExistingCheckResponse = {
  ok: boolean;
  existingImdbIds: string[];
  error?: string;
};

export type ImdbItemImportResult = {
  imdbId: string;
  title: string;
  status: "imported" | "already_exists" | "failed";
  mediaId?: string;
  mediaType?: "movie" | "series";
  error?: string;
};

export type BatchChunkResponse = {
  ok: boolean;
  results: ImdbItemImportResult[];
  importedCount: number;
  alreadyExistsCount: number;
  failedCount: number;
  error?: string;
};

const MAX_CHUNK_SIZE = 25;

/**
 * Checks which of the given IMDb IDs are already in the database.
 */
export async function checkExistingImdbBatch(imdbIds: string[]): Promise<ExistingCheckResponse> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, existingImdbIds: [], error: FORBIDDEN_CATALOG };

  if (!Array.isArray(imdbIds) || imdbIds.length === 0) {
    return { ok: true, existingImdbIds: [] };
  }

  const cleanIds = imdbIds
    .map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))
    .filter(Boolean);

  const existingRows = await db.media.findMany({
    where: { imdbId: { in: cleanIds } },
    select: { imdbId: true },
  });

  const existingImdbIds = existingRows
    .map((r) => r.imdbId)
    .filter((id): id is string => Boolean(id));

  return { ok: true, existingImdbIds };
}

/**
 * Imports a chunk of up to 25 items from an IMDb list into the catalog as drafts.
 */
export async function importImdbBatchChunk(items: ImdbImportItem[]): Promise<BatchChunkResponse> {
  const { allowed } = await catalogSession();
  if (!allowed) {
    return {
      ok: false,
      results: [],
      importedCount: 0,
      alreadyExistsCount: 0,
      failedCount: 0,
      error: FORBIDDEN_CATALOG,
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: true,
      results: [],
      importedCount: 0,
      alreadyExistsCount: 0,
      failedCount: 0,
    };
  }

  const chunk = items.slice(0, MAX_CHUNK_SIZE);
  const results: ImdbItemImportResult[] = [];
  let importedCount = 0;
  let alreadyExistsCount = 0;
  let failedCount = 0;

  for (const item of chunk) {
    const imdbId = item.imdbId.trim().toLowerCase();

    try {
      // 1. Check if title with this IMDb ID already exists in DB
      const existingByImdb = await db.media.findFirst({
        where: { imdbId },
        select: { id: true, title: true, type: true },
      });

      if (existingByImdb) {
        alreadyExistsCount++;
        results.push({
          imdbId,
          title: existingByImdb.title,
          status: "already_exists",
          mediaId: existingByImdb.id,
          mediaType: existingByImdb.type,
        });
        continue;
      }

      // 2. Query TMDB via find
      const found = await findOnTmdb(imdbId);
      let candidateKind: TmdbKind | null = null;
      let candidateId: number | null = null;

      const movies = Array.isArray(found.movies) ? found.movies : [];
      const series = Array.isArray(found.series) ? found.series : [];

      if (item.mediaType === "series" && series.length > 0) {
        candidateKind = "tv";
        candidateId = (series[0] as { id: number }).id;
      } else if (movies.length > 0) {
        candidateKind = "movie";
        candidateId = (movies[0] as { id: number }).id;
      } else if (series.length > 0) {
        candidateKind = "tv";
        candidateId = (series[0] as { id: number }).id;
      }

      if (candidateKind && candidateId) {
        const tmdbRef = formatTmdbRef({ kind: candidateKind, id: candidateId });

        // Check if tmdbId already exists in DB
        const existingByTmdb = await db.media.findFirst({
          where: { tmdbId: tmdbRef },
          select: { id: true, title: true, type: true },
        });

        if (existingByTmdb) {
          alreadyExistsCount++;
          results.push({
            imdbId,
            title: existingByTmdb.title,
            status: "already_exists",
            mediaId: existingByTmdb.id,
            mediaType: existingByTmdb.type,
          });
          continue;
        }

        // Fetch full TMDB details
        const details = await getTmdbDetails(candidateKind, candidateId);
        if (!details) {
          failedCount++;
          results.push({
            imdbId,
            title: item.title,
            status: "failed",
            error: "TMDB returned empty details.",
          });
          continue;
        }

        const targetType = candidateKind === "tv" ? "series" : "movie";
        const settings = await getSiteSettings();
        const cutoffOptions = { shortFilmCutoffMinutes: settings.shortFilmCutoffMinutes };
        let values = tmdbValues(candidateKind, details, targetType, cutoffOptions);

        // Gap fill with OMDb if configured
        if (omdbConfigured()) {
          try {
            const omdbData = await getOmdbById(imdbId);
            if (omdbData) {
              values = fillGaps(values, omdbValues(omdbData, targetType), cutoffOptions).values;
            }
          } catch {
            // Non-fatal: continue with TMDB values
          }
        }

        // Apply safe draft fallbacks so valid drafts can always be created for admin review
        values.title = values.title || item.title || imdbId;
        values.year = values.year || (item.year ? String(item.year) : "2024");
        if (targetType === "movie") {
          values.runtime =
            values.runtime || (item.runtimeMinutes ? String(item.runtimeMinutes) : "90");
          const runtimeNum = Number(values.runtime);
          if (runtimeNum > 0 && runtimeNum <= settings.shortFilmCutoffMinutes) {
            values.category = "Short Film";
          }
        }
        values.country = values.country || "United States";
        values.language = values.language || "English";
        values.genres =
          values.genres ||
          (item.genres && item.genres.length > 0 ? item.genres.join(", ") : "Drama");
        if (item.directors && !values.credit) {
          values.credit = item.directors;
        }
        values.status = "draft";
        values.featured = "";

        const allowedHosts = [...new Set([...imageHosts(), "image.tmdb.org", "m.media-amazon.com"])];
        const parsed = parseTitle(targetType, values, { hosts: allowedHosts });
        if (!parsed.ok) {
          failedCount++;
          results.push({
            imdbId,
            title: values.title,
            status: "failed",
            error: Object.values(parsed.errors).join("; "),
          });
          continue;
        }

        try {
          const id = await insertTitle(targetType, parsed.data, {
            tmdbId: tmdbRef,
            imdbId,
          });

          if (id) {
            importedCount++;
            results.push({
              imdbId,
              title: parsed.data.title,
              status: "imported",
              mediaId: id,
              mediaType: targetType,
            });
          } else {
            alreadyExistsCount++;
            results.push({
              imdbId,
              title: parsed.data.title,
              status: "already_exists",
            });
          }
        } catch (insertError) {
          if (isUniqueViolation(insertError)) {
            alreadyExistsCount++;
            results.push({
              imdbId,
              title: parsed.data.title,
              status: "already_exists",
            });
          } else {
            throw insertError;
          }
        }
        continue;
      }

      // 3. TMDB has no record; fallback to OMDb alone if configured
      if (omdbConfigured()) {
        try {
          const omdbData = await getOmdbById(imdbId);
          if (omdbData) {
            const targetType = item.mediaType;
            const values = omdbValues(omdbData, targetType);
            values.title = values.title || item.title || imdbId;
            values.year = values.year || (item.year ? String(item.year) : "2024");
            if (targetType === "movie") {
              values.runtime =
                values.runtime || (item.runtimeMinutes ? String(item.runtimeMinutes) : "90");
          const runtimeNum = Number(values.runtime);
          if (runtimeNum > 0 && runtimeNum <= settings.shortFilmCutoffMinutes) {
            values.category = "Short Film";
          }
            }
            values.country = values.country || "United States";
            values.language = values.language || "English";
            values.genres =
              values.genres ||
              (item.genres && item.genres.length > 0 ? item.genres.join(", ") : "Drama");
            values.status = "draft";
            values.featured = "";

            const allowedHosts = [...new Set([...imageHosts(), "image.tmdb.org", "m.media-amazon.com"])];
        const parsed = parseTitle(targetType, values, { hosts: allowedHosts });
            if (parsed.ok) {
              const id = await insertTitle(targetType, parsed.data, {
                tmdbId: null,
                imdbId,
              });
              if (id) {
                importedCount++;
                results.push({
                  imdbId,
                  title: parsed.data.title,
                  status: "imported",
                  mediaId: id,
                  mediaType: targetType,
                });
                continue;
              }
            }
          }
        } catch {
          // Fall through to not found
        }
      }

      failedCount++;
      results.push({
        imdbId,
        title: item.title,
        status: "failed",
        error: "Not found on TMDB or OMDb",
      });
    } catch (err: unknown) {
      failedCount++;
      results.push({
        imdbId,
        title: item.title,
        status: "failed",
        error: err instanceof Error ? err.message : "Import failed unexpectedly",
      });
    }
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    results,
    importedCount,
    alreadyExistsCount,
    failedCount,
  };
}
