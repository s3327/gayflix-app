"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findImported } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isImdbId, isTmdbId } from "@/lib/import-mapping";
import { isMediaId } from "@/lib/library-types";
import type { MediaStatus, MediaType } from "@/lib/media";
import { requireAdmin } from "@/lib/session";
import { setAdminFlash } from "@/lib/admin-flash";
import {
  EPISODE_FIELDS,
  TITLE_FIELDS,
  episodeDuration,
  episodeId,
  formValues,
  libraryPath,
  parseEpisode,
  parseTitle,
  seriesDuration,
  type FormState,
} from "@/lib/title-form";
import {
  freeId,
  insertTitle,
  isUniqueViolation,
  titleData,
  unfeatureOthers,
  type SourceIds,
  type Tx,
} from "@/lib/title-store";

/*
 * Server functions behind the admin title editor. Each one checks for an
 * admin itself (a direct POST never runs the panel layout), and checks
 * every argument, the ones bound in the page included: the browser sends
 * those back too.
 */

/** A page of the library holds 50 titles; more than this isn't a real selection. */
const MAX_SELECTED = 100;

function mediaType(value: unknown): MediaType {
  if (value !== "movie" && value !== "series") throw new Error("Invalid type");
  return value;
}

function mediaStatus(value: unknown): MediaStatus {
  if (value !== "draft" && value !== "published") throw new Error("Invalid status");
  return value;
}

function itemId(value: unknown): string {
  if (!isMediaId(value)) throw new Error("Invalid id");
  return value;
}

/** The checked rows of a library page. */
function selectedIds(form: FormData) {
  return [...new Set(form.getAll("ids").filter(isMediaId))].slice(0, MAX_SELECTED);
}

/** Titles show up all over the public site and the admin panel. */
function refreshPages() {
  revalidatePath("/", "layout");
}

// --- Titles -------------------------------------------------------------------

/**
 * The hidden fields of a form the Import page filled in: where the title
 * came from. Empty when it was typed in.
 */
function sourceIds(form: FormData): SourceIds {
  const tmdbId = form.get("tmdbId") || null;
  const imdbId = form.get("imdbId") || null;
  if (tmdbId !== null && !isTmdbId(tmdbId)) throw new Error("Invalid TMDB id");
  if (imdbId !== null && !isImdbId(imdbId)) throw new Error("Invalid IMDb id");
  return { tmdbId, imdbId };
}

/**
 * "Add a movie" / "Add a series", and the Import page's form when an
 * import needs fixing first. Opens the new title's edit page.
 */
export async function createTitle(
  typeArg: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin();
  const type = mediaType(typeArg);
  const sources = sourceIds(form);
  const values = formValues(form, TITLE_FIELDS);
  const parsed = parseTitle(type, values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };

  if (sources.tmdbId || sources.imdbId) {
    const [existing] = await findImported({
      tmdbIds: sources.tmdbId ? [sources.tmdbId] : [],
      imdbIds: sources.imdbId ? [sources.imdbId] : [],
    });
    if (existing) {
      return { message: "This title is already in the library.", values, version: Date.now() };
    }
  }
  const id = await insertTitle(type, parsed.data, sources);
  if (!id) {
    return { message: "Another title took that address just now. Add it again.", values, version: Date.now() };
  }
  refreshPages();
  redirect(`${libraryPath(type)}/${id}?${sources.tmdbId ? "imported" : "added"}=1`);
}

/** Saves the edit page. A title's type and address don't change. */
export async function updateTitle(
  idArg: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = itemId(idArg);
  const values = formValues(form, TITLE_FIELDS);
  const loadedAt = form.get("loadedAt");
  const gone = { message: "This title is in the trash or was deleted.", values, version: Date.now() };
  const existing = await db.media.findUnique({
    where: { id },
    select: { type: true, trashedAt: true, updatedAt: true },
  });
  if (!existing || existing.trashedAt) return gone;

  if (typeof loadedAt === "string" && loadedAt) {
    const loadedDate = new Date(loadedAt);
    if (!isNaN(loadedDate.getTime()) && existing.updatedAt.getTime() > loadedDate.getTime()) {
      return {
        ok: false,
        message:
          "Another admin edited this title while you had it open. Review the current version before saving to avoid overwriting their changes.",
        values,
        version: Date.now(),
      };
    }
  }

  const parsed = parseTitle(existing.type, values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const saved = await db.$transaction(async (tx) => {
    // Not if it was trashed meanwhile: a trashed title must stay a draft.
    const { count } = await tx.media.updateMany({
      where: { id, trashedAt: null },
      data: titleData(existing.type, parsed.data),
    });
    if (count > 0 && parsed.data.featured && parsed.data.status === "published") {
      await unfeatureOthers(tx, id);
    }
    return count > 0;
  });
  if (!saved) return gone;
  refreshPages();
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

export async function updateMediaStatusBatch(ids: string[], status: MediaStatus) {
  if (ids.length === 0) return;
  await db.$transaction(async (tx) => {
    await tx.media.updateMany({ where: { id: { in: ids }, trashedAt: null }, data: { status } });
    if (status === "published") {
      const featured = await tx.media.findFirst({
        where: { id: { in: ids }, featured: true, trashedAt: null },
        select: { id: true },
      });
      if (featured) {
        await unfeatureOthers(tx, featured.id);
      }
    }
  });
  refreshPages();
}

/** Publish or unpublish one title (a library row's button). */
export async function setTitleStatus(idArg: unknown, statusArg: unknown): Promise<void> {
  await requireAdmin();
  const id = itemId(idArg);
  const status = mediaStatus(statusArg);
  await updateMediaStatusBatch([id], status);
  const isPub = status === "published";
  await setAdminFlash({
    message: isPub ? "Title published." : "Title unpublished.",
    undo: {
      label: "Undo",
      action: isPub ? "unpublish_media" : "publish_media",
      ids: [id],
    },
  });
}

/** Publish or unpublish the checked rows. */
export async function setSelectedStatus(statusArg: unknown, form: FormData): Promise<void> {
  await requireAdmin();
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  const status = mediaStatus(statusArg);
  await updateMediaStatusBatch(ids, status);
  const isPub = status === "published";
  await setAdminFlash({
    message: `${ids.length} ${ids.length === 1 ? "title" : "titles"} ${isPub ? "published" : "unpublished"}.`,
    undo: {
      label: "Undo",
      action: isPub ? "unpublish_media" : "publish_media",
      ids,
    },
  });
}

/**
 * Trashed titles become drafts, so the public site drops them at once,
 * and stop being featured. They can be restored (as drafts) or deleted
 * for good from /admin/trash.
 */
async function moveToTrash(ids: string[]) {
  if (ids.length === 0) return;
  await db.$transaction(async (tx) => {
    const items = await tx.media.findMany({
      where: { id: { in: ids }, trashedAt: null },
      select: { id: true, status: true, featured: true },
    });
    for (const item of items) {
      await tx.media.update({
        where: { id: item.id },
        data: {
          statusBeforeTrash: item.status,
          featuredBeforeTrash: item.featured,
          status: "draft",
          featured: false,
          trashedAt: new Date(),
        },
      });
    }
  });
  refreshPages();
}

export async function trashTitle(idArg: unknown): Promise<void> {
  await requireAdmin();
  const id = itemId(idArg);
  await moveToTrash([id]);
  await setAdminFlash({
    message: "Moved to trash.",
    undo: { label: "Undo", action: "restore_media", ids: [id] },
  });
}

export async function trashSelected(form: FormData): Promise<void> {
  await requireAdmin();
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  await moveToTrash(ids);
  await setAdminFlash({
    message: `${ids.length} ${ids.length === 1 ? "title" : "titles"} moved to trash.`,
    undo: { label: "Undo", action: "restore_media", ids },
  });
}

/** Back from the trash, restoring its previous status and featured flag. */
export async function restoreTitle(idArg: unknown): Promise<void> {
  await requireAdmin();
  const id = itemId(idArg);
  await db.$transaction(async (tx) => {
    const item = await tx.media.findUnique({
      where: { id },
      select: { statusBeforeTrash: true, featuredBeforeTrash: true, trashedAt: true },
    });
    if (!item || !item.trashedAt) return;
    const restoredStatus = item.statusBeforeTrash ?? "draft";
    const restoredFeatured = item.featuredBeforeTrash ?? false;

    await tx.media.update({
      where: { id },
      data: {
        status: restoredStatus,
        featured: restoredFeatured,
        statusBeforeTrash: null,
        featuredBeforeTrash: null,
        trashedAt: null,
      },
    });

    if (restoredFeatured && restoredStatus === "published") {
      await unfeatureOthers(tx, id);
    }
  });
  refreshPages();
  await setAdminFlash({ message: "Title restored." });
}

/** For good, with its episodes. Only titles already in the trash. */
export async function deleteTitle(idArg: unknown): Promise<void> {
  await requireAdmin();
  await db.media.deleteMany({ where: { id: itemId(idArg), trashedAt: { not: null } } });
  refreshPages();
  await setAdminFlash({ message: "Title deleted permanently." });
}

// --- Episodes -----------------------------------------------------------------

/** A series' card shows how many seasons it has episodes in. */
async function refreshSeasons(tx: Tx, seriesId: string) {
  const seasons = await tx.episode.groupBy({ by: ["seasonNumber"], where: { mediaId: seriesId } });
  await tx.media.update({ where: { id: seriesId }, data: { duration: seriesDuration(seasons.length) } });
}

const SERIES_IN_TRASH = "Its series is in the trash. Restore the series to change its episodes.";

function takenMessage(season: number, episode: number) {
  return `Season ${season} already has an episode ${episode}.`;
}

/**
 * "Add an episode". Stays on the form, ready for the next episode of the
 * same season.
 */
export async function createEpisode(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(form, EPISODE_FIELDS);
  const parsed = parseEpisode(values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const { seriesId, seasonNumber, episodeNumber, title, minutes, airDate } = parsed.data;

  const series = await db.media.findUnique({
    where: { id: seriesId },
    select: { type: true, trashedAt: true },
  });
  if (series?.type !== "series" || series.trashedAt) {
    return { errors: { series: "Choose the series." }, values, version: Date.now() };
  }
  const taken = await db.episode.findUnique({
    where: { mediaId_seasonNumber_episodeNumber: { mediaId: seriesId, seasonNumber, episodeNumber } },
    select: { id: true },
  });
  if (taken) {
    return { errors: { episode: takenMessage(seasonNumber, episodeNumber) }, values, version: Date.now() };
  }

  const id = await freeId(episodeId(seriesId, seasonNumber, episodeNumber));
  try {
    await db.$transaction(async (tx) => {
      await tx.episode.create({
        data: {
          id,
          mediaId: seriesId,
          seasonNumber,
          episodeNumber,
          title,
          duration: episodeDuration(minutes),
          airDate,
        },
      });
      await refreshSeasons(tx, seriesId);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { errors: { episode: takenMessage(seasonNumber, episodeNumber) }, values, version: Date.now() };
  }
  refreshPages();
  return {
    ok: true,
    message: `Added season ${seasonNumber}, episode ${episodeNumber}.`,
    values: { ...values, episode: String(episodeNumber + 1), title: "", airDate: "" },
    version: Date.now(),
  };
}

/** Saves an episode's edit page. It stays with its series. */
export async function updateEpisode(
  idArg: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = itemId(idArg);
  const existing = await db.episode.findUnique({
    where: { id },
    select: { mediaId: true, media: { select: { trashedAt: true } } },
  });
  const values = { ...formValues(form, EPISODE_FIELDS), series: existing?.mediaId ?? "" };
  if (!existing) return { message: "This episode was deleted.", values, version: Date.now() };
  if (existing.media.trashedAt) return { message: SERIES_IN_TRASH, values, version: Date.now() };

  const parsed = parseEpisode(values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const { seasonNumber, episodeNumber, title, minutes, airDate } = parsed.data;
  try {
    await db.$transaction(async (tx) => {
      await tx.episode.update({
        where: { id },
        data: { seasonNumber, episodeNumber, title, duration: episodeDuration(minutes), airDate },
      });
      await refreshSeasons(tx, existing.mediaId);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { errors: { episode: takenMessage(seasonNumber, episodeNumber) }, values, version: Date.now() };
  }
  refreshPages();
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

/** Deletes an episode for good, then opens its series' edit page. */
export async function deleteEpisode(idArg: unknown): Promise<void> {
  await requireAdmin();
  const id = itemId(idArg);
  const episode = await db.episode.findUnique({
    where: { id },
    select: { mediaId: true, media: { select: { trashedAt: true } } },
  });
  if (!episode) redirect("/admin/library/episodes");
  // Like the series itself: restored before it's changed.
  if (episode.media.trashedAt) redirect(`/admin/library/episodes/${id}`);
  await db.$transaction(async (tx) => {
    await tx.episode.delete({ where: { id } });
    await refreshSeasons(tx, episode.mediaId);
  });
  refreshPages();
  await setAdminFlash({ message: "Episode deleted." });
  redirect(`/admin/library/series/${episode.mediaId}`);
}
