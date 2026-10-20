"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isImdbId, isTmdbId, parseTmdbRef } from "@/lib/import-mapping";
import { isMediaId } from "@/lib/library-types";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { libraryPath, parseTitle, titleValues, uploadPath } from "@/lib/title-form";
import { freshValues, prepareImport, type ImportState } from "@/lib/title-import";
import { createTitleRevision } from "@/lib/title-revisions";
import { insertTitle, isUniqueViolation, titleData } from "@/lib/title-store";

/*
 * The Import page's server function. Like the title editor's, it checks
 * for an admin itself and checks every argument, the bound TMDB id
 * included: the browser sends it back too.
 */

/**
 * A result card's Import button. A clean import is saved as a draft and
 * its edit page opens; one with a doubtful IMDb match or a field to fix
 * opens the prefilled form instead. When TMDB and IMDb disagree on the
 * type, the card asks which one; the answer comes back as `as`.
 */
export async function importTitle(
  tmdbIdArg: unknown,
  _state: ImportState,
  form: FormData
): Promise<ImportState> {
  const { allowed } = await catalogSession();
  if (!allowed) return { message: FORBIDDEN_CATALOG };
  const ref = parseTmdbRef(tmdbIdArg);
  if (!ref) throw new Error("Invalid TMDB id");
  const as = form.get("as");
  if (as !== null && as !== "movie" && as !== "series") throw new Error("Invalid type");

  const plan = await prepareImport(ref, as);
  if (plan.status === "failed") return { message: plan.message };
  if (plan.status === "exists") return { existing: plan.title };
  if (plan.status === "conflict") return { conflict: { tmdb: plan.tmdbType, imdb: plan.imdbType } };
  if (!plan.input) {
    redirect(`${uploadPath(plan.type)}?${new URLSearchParams({ tmdb: plan.sources.tmdbId })}`);
  }

  const id = await insertTitle(plan.type, plan.input, plan.sources);
  if (!id) return { message: "It was imported just now, maybe by someone else. Search again to find it." };
  revalidatePath("/", "layout");
  redirect(`${libraryPath(plan.type)}/${id}?imported=1`);
}

/** One search page's worth (TMDB pages of movies and series hold 20 each). */
const MAX_BATCH_IMPORT = 40;

/** Import multiple titles from TMDB search in batch. */
export async function importMultipleTitles(
  tmdbIdsArg: unknown
): Promise<{ ok: boolean; imported: number; skipped: number; errors: string[] }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, imported: 0, skipped: 0, errors: [FORBIDDEN_CATALOG] };
  if (!Array.isArray(tmdbIdsArg) || tmdbIdsArg.length > MAX_BATCH_IMPORT) {
    return { ok: false, imported: 0, skipped: 0, errors: [`Import up to ${MAX_BATCH_IMPORT} titles at a time.`] };
  }
  const tmdbIds = [...new Set(tmdbIdsArg)];
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const rawId of tmdbIds) {
    try {
      const ref = parseTmdbRef(rawId);
      if (!ref) {
        skipped++;
        continue;
      }
      const plan = await prepareImport(ref, null);
      if (plan.status !== "ready" || !plan.input) {
        skipped++;
        continue;
      }
      const id = await insertTitle(plan.type, plan.input, plan.sources);
      if (id) imported++;
      else skipped++;
    } catch (err: unknown) {
      skipped++;
      errors.push(err instanceof Error ? err.message : "Import failed");
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, imported, skipped, errors };
}

/** Refresh's fields: the title form's field, and its name in lockedFields. */
const REFRESH_FIELDS = [
  ["title", "title"],
  ["year", "year"],
  ["runtime", "runtimeMinutes"],
  ["synopsis", "synopsis"],
  ["tagline", "tagline"],
  ["posterUrl", "posterUrl"],
  ["backdropUrl", "backdropUrl"],
  ["trailerUrl", "trailerUrl"],
  ["maturityRating", "maturityRating"],
  ["credit", "director"],
  ["credit", "creator"],
  ["cast", "cast"],
  ["genres", "genres"],
] as const;

/**
 * Refresh from TMDB. Fills empty fields from TMDB (every unlocked field
 * with `overwriteUnlocked`), then saves through the title form's checks.
 * Status and Featured stay as they are.
 */
export async function refreshTitleFromTmdb(
  input: unknown
): Promise<{ ok: boolean; message?: string; updatedFields?: string[] }> {
  const { session, allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  if (!isMediaId(raw.id)) return { ok: false, message: "Invalid title ID" };
  const id = raw.id;
  const overwriteUnlocked = raw.overwriteUnlocked === true;

  const { db } = await import("@/lib/db");
  const existing = await db.media.findUnique({ where: { id } });
  if (!existing || existing.trashedAt || !existing.tmdbId) {
    return { ok: false, message: "Title not found or has no linked TMDB ID" };
  }
  const ref = parseTmdbRef(existing.tmdbId);
  if (!ref) return { ok: false, message: "Invalid linked TMDB reference" };

  const fresh = await freshValues(ref, existing.type);
  if (!fresh.ok) return { ok: false, message: fresh.message };

  const current = titleValues(existing);
  const values = { ...current };
  const locked = new Set(existing.lockedFields);
  const updatedFields: string[] = [];
  for (const [field, column] of REFRESH_FIELDS) {
    if ((column === "director" || column === "runtimeMinutes") && existing.type !== "movie") continue;
    if (column === "creator" && existing.type !== "series") continue;
    if (locked.has(column) || !fresh.values[field]) continue;
    if ((overwriteUnlocked || !current[field]) && fresh.values[field] !== current[field]) {
      values[field] = fresh.values[field];
      updatedFields.push(column);
    }
  }
  if (updatedFields.length === 0) return { ok: true, updatedFields };

  const parsed = parseTitle(existing.type, values);
  if (!parsed.ok) {
    const [problem] = Object.values(parsed.errors);
    return { ok: false, message: `TMDB's details can't be saved as they are. ${problem}` };
  }
  await createTitleRevision({
    mediaId: id,
    actorId: session.user.id,
    actorEmail: session.user.email,
    summary: `Refreshed ${updatedFields.join(", ")} from TMDB`,
  });
  await db.media.updateMany({ where: { id, trashedAt: null }, data: titleData(existing.type, parsed.data) });
  revalidatePath("/", "layout");
  return { ok: true, updatedFields };
}

/**
 * Re-link a title to a different TMDB or IMDb ID ("movie/603",
 * "tt0133093"). A field left out stays as it is.
 */
export async function fixTitleMatch(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  if (!isMediaId(raw.id)) return { ok: false, message: "Invalid title ID" };
  const id = raw.id;
  const tmdbId = typeof raw.tmdbId === "string" ? raw.tmdbId.trim() : raw.tmdbId;
  const imdbId = typeof raw.imdbId === "string" ? raw.imdbId.trim().toLowerCase() : raw.imdbId;
  if (tmdbId !== undefined && !isTmdbId(tmdbId)) {
    return { ok: false, message: "Enter the TMDB ID like movie/603 or tv/1399." };
  }
  if (imdbId !== undefined && !isImdbId(imdbId)) {
    return { ok: false, message: "Enter the IMDb ID like tt0133093." };
  }
  const { db } = await import("@/lib/db");
  const existing = await db.media.findUnique({ where: { id }, select: { type: true, trashedAt: true } });
  if (!existing || existing.trashedAt) return { ok: false, message: "Title not found or in trash" };
  if (tmdbId !== undefined && parseTmdbRef(tmdbId)?.kind !== (existing.type === "movie" ? "movie" : "tv")) {
    return { ok: false, message: `That TMDB ID isn't a ${existing.type}.` };
  }

  try {
    await db.media.update({
      where: { id },
      data: {
        ...(tmdbId !== undefined ? { tmdbId } : {}),
        ...(imdbId !== undefined ? { imdbId } : {}),
      },
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return { ok: false, message: "Another title already has that ID." };
    throw error;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
