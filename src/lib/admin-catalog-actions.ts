"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
import type { MediaStatus, MediaType } from "@/lib/media";
import { requireAdmin } from "@/lib/session";
import {
  EPISODE_FIELDS,
  TITLE_FIELDS,
  episodeDuration,
  episodeId,
  formValues,
  gradientFor,
  libraryPath,
  movieDuration,
  parseEpisode,
  parseTitle,
  seriesDuration,
  slugify,
  type FormState,
  type TitleInput,
} from "@/lib/title-form";

/*
 * Server functions behind the admin title editor. Each one checks for an
 * admin itself (a direct POST never runs the panel layout), and checks
 * every argument, the ones bound in the page included: the browser sends
 * those back too.
 */

/** A page of the library holds 50 titles; more than this isn't a real selection. */
const MAX_SELECTED = 100;

type Tx = Prisma.TransactionClient;

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

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** The base address, or base-2, base-3...: one no title or episode has. */
async function freeId(base: string) {
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
async function unfeatureOthers(tx: Tx, id: string) {
  // Raw, so the others' updatedAt (and their place in listings) stays.
  await tx.$executeRaw`UPDATE media SET featured = false WHERE featured AND id <> ${id}`;
}

function titleData(type: MediaType, input: TitleInput) {
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
    featured: input.featured,
    ...(type === "movie" && {
      runtimeMinutes: input.runtimeMinutes,
      duration: movieDuration(input.runtimeMinutes!),
    }),
  } satisfies Prisma.MediaUpdateInput;
}

// --- Titles -------------------------------------------------------------------

/** "Add a movie" / "Add a series". Opens the new title's edit page. */
export async function createTitle(
  typeArg: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin();
  const type = mediaType(typeArg);
  const values = formValues(form, TITLE_FIELDS);
  const parsed = parseTitle(type, values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };

  const id = await freeId(slugify(parsed.data.title) || type);
  try {
    await db.$transaction(async (tx) => {
      if (parsed.data.featured) await unfeatureOthers(tx, id);
      await tx.media.create({
        data: {
          id,
          type,
          ...titleData(type, parsed.data),
          // A series' seasons come from its episodes, and it has none yet.
          duration: type === "movie" ? movieDuration(parsed.data.runtimeMinutes!) : seriesDuration(0),
          gradient: gradientFor(id),
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { message: "Another title took that address just now. Add it again.", values, version: Date.now() };
  }
  refreshPages();
  redirect(`${libraryPath(type)}/${id}?added=1`);
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
  const gone = { message: "This title is in the trash or was deleted.", values, version: Date.now() };
  const existing = await db.media.findUnique({ where: { id }, select: { type: true, trashedAt: true } });
  if (!existing || existing.trashedAt) return gone;

  const parsed = parseTitle(existing.type, values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const saved = await db.$transaction(async (tx) => {
    // Not if it was trashed meanwhile: a trashed title must stay a draft.
    const { count } = await tx.media.updateMany({
      where: { id, trashedAt: null },
      data: titleData(existing.type, parsed.data),
    });
    if (count > 0 && parsed.data.featured) await unfeatureOthers(tx, id);
    return count > 0;
  });
  if (!saved) return gone;
  refreshPages();
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

async function updateStatus(ids: string[], status: MediaStatus) {
  if (ids.length === 0) return;
  await db.media.updateMany({ where: { id: { in: ids }, trashedAt: null }, data: { status } });
  refreshPages();
}

/** Publish or unpublish one title (a library row's button). */
export async function setTitleStatus(idArg: unknown, statusArg: unknown): Promise<void> {
  await requireAdmin();
  await updateStatus([itemId(idArg)], mediaStatus(statusArg));
}

/** Publish or unpublish the checked rows. */
export async function setSelectedStatus(statusArg: unknown, form: FormData): Promise<void> {
  await requireAdmin();
  await updateStatus(selectedIds(form), mediaStatus(statusArg));
}

/**
 * Trashed titles become drafts, so the public site drops them at once,
 * and stop being featured. They can be restored (as drafts) or deleted
 * for good from /admin/trash.
 */
async function moveToTrash(ids: string[]) {
  if (ids.length === 0) return;
  await db.media.updateMany({
    where: { id: { in: ids }, trashedAt: null },
    data: { status: "draft", featured: false, trashedAt: new Date() },
  });
  refreshPages();
}

export async function trashTitle(idArg: unknown): Promise<void> {
  await requireAdmin();
  await moveToTrash([itemId(idArg)]);
}

export async function trashSelected(form: FormData): Promise<void> {
  await requireAdmin();
  await moveToTrash(selectedIds(form));
}

/** Back from the trash, as a draft. */
export async function restoreTitle(idArg: unknown): Promise<void> {
  await requireAdmin();
  await db.media.updateMany({
    where: { id: itemId(idArg), trashedAt: { not: null } },
    data: { trashedAt: null },
  });
  refreshPages();
}

/** For good, with its episodes. Only titles already in the trash. */
export async function deleteTitle(idArg: unknown): Promise<void> {
  await requireAdmin();
  await db.media.deleteMany({ where: { id: itemId(idArg), trashedAt: { not: null } } });
  refreshPages();
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
  redirect(`/admin/library/series/${episode.mediaId}`);
}
