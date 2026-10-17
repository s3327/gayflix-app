"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findImported } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isImdbId, isTmdbId, parseTmdbRef, tmdbStill } from "@/lib/import-mapping";
import { isMediaId } from "@/lib/library-types";
import type { MediaStatus, MediaType } from "@/lib/media";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { setAdminFlash } from "@/lib/admin-flash";
import { imageHosts } from "@/lib/image-hosts.mjs";
import { createTitleRevision } from "@/lib/title-revisions";
import { logActivity } from "@/lib/activity-logger";
import { getTmdbDetails, getTmdbSeasonDetails } from "@/lib/tmdb";
import { videoHosts, videoUrlAllowed } from "@/lib/video-hosts";
import {
  EPISODE_FIELDS,
  TITLE_FIELDS,
  episodeDuration,
  episodeId,
  formValues,
  imageUrlProblem,
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
  const { session, allowed } = await catalogSession();
  const values = formValues(form, TITLE_FIELDS);
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
  const type = mediaType(typeArg);
  const sources = sourceIds(form);
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
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.create",
    entityType: "media",
    entityId: id,
    summary: `Created ${type} "${parsed.data.title}"`,
    details: { type, title: parsed.data.title, year: parsed.data.year },
  });
  refreshPages();
  redirect(`${libraryPath(type)}/${id}?${sources.tmdbId ? "imported" : "added"}=1`);
}

/** Saves the edit page. A title's type and address don't change. */
export async function updateTitle(
  idArg: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  const { session, allowed } = await catalogSession();
  const values = formValues(form, TITLE_FIELDS);
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
  const id = itemId(idArg);
  const loadedAt = form.get("loadedAt");
  const gone = { message: "This title is in the trash or was deleted.", values, version: Date.now() };
  const existing = await db.media.findUnique({
    where: { id },
    select: { type: true, status: true, publishedAt: true, trashedAt: true, updatedAt: true },
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

  // Create point-in-time snapshot before modifying
  await createTitleRevision({
    mediaId: id,
    actorId: session.user.id,
    actorEmail: session.user.email,
    summary: `Updated title metadata for "${parsed.data.title}"`,
  });

  const shouldSetPublishedAt =
    parsed.data.status === "published" &&
    (existing.status !== "published" || existing.publishedAt === null);

  const saved = await db.$transaction(async (tx) => {
    // Not if it was trashed meanwhile: a trashed title must stay a draft.
    const { count } = await tx.media.updateMany({
      where: { id, trashedAt: null },
      data: {
        ...titleData(existing.type, parsed.data),
        ...(shouldSetPublishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    if (count > 0 && parsed.data.featured && parsed.data.status === "published") {
      await unfeatureOthers(tx, id);
    }
    return count > 0;
  });
  if (!saved) return gone;

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.update",
    entityType: "media",
    entityId: id,
    summary: `Updated ${existing.type} "${parsed.data.title}"`,
    details: { title: parsed.data.title, status: parsed.data.status },
  });

  refreshPages();
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

export async function updateMediaStatusBatch(ids: string[], status: MediaStatus) {
  const { allowed } = await catalogSession();
  if (!allowed || ids.length === 0) return;
  await db.$transaction(async (tx) => {
    if (status === "published") {
      await tx.media.updateMany({
        where: { id: { in: ids }, trashedAt: null },
        data: { status, publishedAt: new Date() },
      });
      const featured = await tx.media.findFirst({
        where: { id: { in: ids }, featured: true, trashedAt: null },
        select: { id: true },
      });
      if (featured) {
        await unfeatureOthers(tx, featured.id);
      }
    } else {
      await tx.media.updateMany({ where: { id: { in: ids }, trashedAt: null }, data: { status } });
    }
  });
  refreshPages();
}

/** Publish or unpublish one title (a library row's button). */
export async function setTitleStatus(idArg: unknown, statusArg: unknown): Promise<void> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  const status = mediaStatus(statusArg);
  await updateMediaStatusBatch([id], status);
  const isPub = status === "published";
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: isPub ? "title.publish" : "title.unpublish",
    entityType: "media",
    entityId: id,
    summary: `${isPub ? "Published" : "Unpublished"} title ${id}`,
  });
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
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  const status = mediaStatus(statusArg);
  await updateMediaStatusBatch(ids, status);
  const isPub = status === "published";
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: isPub ? "title.publish" : "title.unpublish",
    entityType: "media",
    entityId: ids.join(","),
    summary: `${isPub ? "Published" : "Unpublished"} ${ids.length} titles`,
  });
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
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  await moveToTrash([id]);
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.trash",
    entityType: "media",
    entityId: id,
    summary: `Moved title ${id} to trash`,
  });
  await setAdminFlash({
    message: "Moved to trash.",
    undo: { label: "Undo", action: "restore_media", ids: [id] },
  });
}

export async function trashSelected(form: FormData): Promise<void> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  await moveToTrash(ids);
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.trash",
    entityType: "media",
    entityId: ids.join(","),
    summary: `Moved ${ids.length} titles to trash`,
  });
  await setAdminFlash({
    message: `${ids.length} ${ids.length === 1 ? "title" : "titles"} moved to trash.`,
    undo: { label: "Undo", action: "restore_media", ids },
  });
}

/** Back from the trash, restoring its previous status and featured flag. */
export async function restoreTitle(idArg: unknown): Promise<void> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
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
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.restore",
    entityType: "media",
    entityId: id,
    summary: `Restored title ${id} from trash`,
  });
  refreshPages();
  await setAdminFlash({ message: "Title restored." });
}

/** For good, with its episodes. Only titles already in the trash. */
export async function deleteTitle(idArg: unknown): Promise<void> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  await db.media.deleteMany({ where: { id, trashedAt: { not: null } } });
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.delete",
    entityType: "media",
    entityId: id,
    summary: `Permanently deleted title ${id}`,
  });
  refreshPages();
  await setAdminFlash({ message: "Title deleted permanently." });
}

/** Restore multiple checked titles from trash. */
export async function bulkRestoreTrash(form: FormData): Promise<void> {
  const { allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  await db.$transaction(async (tx) => {
    for (const id of ids) {
      const item = await tx.media.findUnique({
        where: { id },
        select: { statusBeforeTrash: true, featuredBeforeTrash: true, trashedAt: true },
      });
      if (!item || !item.trashedAt) continue;
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
    }
  });
  refreshPages();
  await setAdminFlash({
    message: `${ids.length} ${ids.length === 1 ? "title" : "titles"} restored.`,
    undo: { label: "Undo", action: "restore_media", ids },
  });
}

/** Permanently delete multiple checked titles from trash. */
export async function bulkDeleteForGoodTrash(form: FormData): Promise<void> {
  const { allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  await db.media.deleteMany({ where: { id: { in: ids }, trashedAt: { not: null } } });
  refreshPages();
  await setAdminFlash({
    message: `${ids.length} ${ids.length === 1 ? "title" : "titles"} deleted permanently.`,
  });
}

/** Quick inline metadata update without leaving the library page. */
export async function quickUpdateTitle({
  id,
  title,
  year,
  status,
  duration,
  genres,
  tagline,
  rating,
}: {
  id: string;
  title: string;
  year: number;
  status: "draft" | "published";
  duration?: string;
  genres?: string[];
  tagline?: string | null;
  rating?: number | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { session, allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  if (!isMediaId(id)) return { ok: false, message: "Invalid title ID" };
  const existing = await db.media.findUnique({
    where: { id },
    select: { type: true, status: true, publishedAt: true, trashedAt: true },
  });
  if (!existing || existing.trashedAt) return { ok: false, message: "Title not found or in trash" };

  // Save revision snapshot before applying quick updates
  await createTitleRevision({
    mediaId: id,
    actorId: session.user.id,
    actorEmail: session.user.email,
    summary: `Quick edited metadata for "${title.trim()}"`,
  });

  const shouldSetPublishedAt =
    status === "published" && (existing.status !== "published" || existing.publishedAt === null);

  await db.media.update({
    where: { id },
    data: {
      title: title.trim(),
      year,
      status,
      ...(duration ? { duration } : {}),
      ...(genres ? { genres } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(shouldSetPublishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.quick_edit",
    entityType: "media",
    entityId: id,
    summary: `Quick edited "${title.trim()}"`,
    details: { title: title.trim(), year, status },
  });

  refreshPages();
  return { ok: true };
}

/** Batch add or remove tags and genres across multiple selected titles. */
export async function bulkTagTitles({
  ids,
  addTags = [],
  removeTags = [],
  addGenres = [],
  removeGenres = [],
}: {
  ids: string[];
  addTags?: string[];
  removeTags?: string[];
  addGenres?: string[];
  removeGenres?: string[];
}): Promise<{ ok: boolean; count: number }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, count: 0 };
  if (!ids || ids.length === 0) return { ok: true, count: 0 };
  const items = await db.media.findMany({
    where: { id: { in: ids }, trashedAt: null },
    select: { id: true, tags: true, genres: true },
  });

  await db.$transaction(async (tx) => {
    for (const item of items) {
      let tags = item.tags;
      let genres = item.genres;

      if (addTags.length > 0) {
        tags = Array.from(new Set([...tags, ...addTags.map((t) => t.trim()).filter(Boolean)]));
      }
      if (removeTags.length > 0) {
        tags = tags.filter((t) => !removeTags.includes(t));
      }
      if (addGenres.length > 0) {
        genres = Array.from(new Set([...genres, ...addGenres.map((g) => g.trim()).filter(Boolean)]));
      }
      if (removeGenres.length > 0) {
        genres = genres.filter((g) => !removeGenres.includes(g));
      }

      await tx.media.update({
        where: { id: item.id },
        data: { tags, genres },
      });
    }
  });

  refreshPages();
  await setAdminFlash({
    message: `Updated tags and genres for ${items.length} ${items.length === 1 ? "title" : "titles"}.`,
  });
  return { ok: true, count: items.length };
}

const LINK_CHECK_HEADERS = { "User-Agent": "Gayflix-Admin-LinkCheck/1.0" };
const LINK_CHECK_REDIRECTS = 3;

/**
 * "Test" on a video source: whether the link answers. Only links on
 * VIDEO_HOSTS are fetched, and a redirect is followed only while it stays
 * on them, so the check can't be pointed at the server's own network.
 */
export async function verifyVideoUrl(
  url: unknown
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, error: FORBIDDEN_CATALOG };
  if (typeof url !== "string" || url.length > 2048) return { ok: false, error: "That isn't a link." };
  const hosts = videoHosts();
  if (!videoUrlAllowed(url, hosts)) {
    return { ok: false, error: "Only https links on the video hosts (VIDEO_HOSTS) can be tested." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    let current = url;
    for (let hop = 0; hop <= LINK_CHECK_REDIRECTS; hop++) {
      const init = { signal: controller.signal, redirect: "manual" as const };
      const res = await fetch(current, { ...init, method: "HEAD", headers: LINK_CHECK_HEADERS }).catch(() =>
        fetch(current, { ...init, method: "GET", headers: { ...LINK_CHECK_HEADERS, Range: "bytes=0-100" } })
      );
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) return { ok: res.status < 400, status: res.status };
      current = new URL(location, current).toString();
      if (!videoUrlAllowed(current, hosts)) {
        return { ok: false, status: res.status, error: "The link redirects off the video hosts." };
      }
    }
    return { ok: false, error: "The link redirects too many times." };
  } catch (err: unknown) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: timedOut ? "The link didn't answer in time." : "The link couldn't be reached." };
  } finally {
    clearTimeout(timeout);
  }
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
  const { allowed } = await catalogSession();
  const values = formValues(form, EPISODE_FIELDS);
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
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
  const { allowed } = await catalogSession();
  const id = itemId(idArg);
  const existing = await db.episode.findUnique({
    where: { id },
    select: { mediaId: true, media: { select: { trashedAt: true } } },
  });
  const values = { ...formValues(form, EPISODE_FIELDS), series: existing?.mediaId ?? "" };
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
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
  const { allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
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

export type TmdbSeasonInfo = {
  season_number: number;
  name: string;
  episode_count: number;
  air_date?: string | null;
  poster_path?: string | null;
};

export async function getSeriesTmdbSeasonsAction(
  seriesId: string
): Promise<{ ok: boolean; seasons?: TmdbSeasonInfo[]; message?: string }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const series = await db.media.findUnique({
    where: { id: seriesId },
    select: { tmdbId: true },
  });
  if (!series?.tmdbId) return { ok: false, message: "Series has no TMDB ID." };
  const ref = parseTmdbRef(series.tmdbId);
  if (!ref || ref.kind !== "tv") return { ok: false, message: "Invalid TMDB reference." };

  try {
    const details = (await getTmdbDetails("tv", ref.id)) as { seasons?: TmdbSeasonInfo[] } | null;
    if (!details || !Array.isArray(details.seasons)) {
      return { ok: false, message: "No seasons found on TMDB." };
    }
    const validSeasons = details.seasons
      .filter((s) => s.season_number > 0)
      .map((s) => ({
        season_number: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episode_count: s.episode_count ?? 0,
        air_date: s.air_date ?? null,
        poster_path: s.poster_path ?? null,
      }));
    return { ok: true, seasons: validSeasons };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error loading seasons from TMDB.",
    };
  }
}

export async function getTmdbSeasonPreviewAction(
  seriesId: string,
  seasonNumber: number
): Promise<{
  ok: boolean;
  episodes?: { episodeNumber: number; title: string; runtime: string; stillUrl: string | null }[];
  message?: string;
}> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const series = await db.media.findUnique({
    where: { id: seriesId },
    select: { tmdbId: true },
  });
  if (!series?.tmdbId) return { ok: false, message: "Series has no TMDB ID." };
  const ref = parseTmdbRef(series.tmdbId);
  if (!ref || ref.kind !== "tv") return { ok: false, message: "Invalid TMDB reference." };

  try {
    const seasonData = await getTmdbSeasonDetails(ref.id, seasonNumber);
    if (!seasonData || !Array.isArray(seasonData.episodes)) {
      return { ok: true, episodes: [] };
    }
    const episodes = seasonData.episodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      title: ep.name?.trim() || `Episode ${ep.episode_number}`,
      runtime: `${ep.runtime && ep.runtime > 0 ? ep.runtime : 45} min`,
      stillUrl: tmdbStill(ep.still_path),
    }));
    return { ok: true, episodes };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error loading episode preview from TMDB.",
    };
  }
}

export async function importSeriesSeasonsAction(
  seriesId: string,
  seasonNumbers: number[]
): Promise<{ ok: boolean; count?: number; message?: string }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  if (!Array.isArray(seasonNumbers) || seasonNumbers.length === 0) {
    return { ok: false, message: "Select at least one season." };
  }
  const series = await db.media.findUnique({
    where: { id: seriesId },
    select: { id: true, type: true, tmdbId: true, trashedAt: true },
  });
  if (!series || series.type !== "series" || series.trashedAt) {
    return { ok: false, message: "Series not found or is in trash." };
  }
  const ref = parseTmdbRef(series.tmdbId);
  if (!ref || ref.kind !== "tv") return { ok: false, message: "Invalid TMDB ID on series." };

  try {
    let importedCount = 0;
    for (const sNum of seasonNumbers) {
      const seasonData = await getTmdbSeasonDetails(ref.id, sNum);
      if (!seasonData || !Array.isArray(seasonData.episodes)) continue;

      const existingEpisodes = await db.episode.findMany({
        where: { mediaId: seriesId, seasonNumber: sNum },
        select: { episodeNumber: true },
      });
      const existingSet = new Set(existingEpisodes.map((e) => e.episodeNumber));

      const missing = seasonData.episodes.filter((ep) => !existingSet.has(ep.episode_number));

      for (const ep of missing) {
        const id = `${seriesId}-season-${sNum}-episode-${ep.episode_number}`;
        const runtime = ep.runtime && ep.runtime > 0 ? ep.runtime : 45;
        await db.episode.create({
          data: {
            id,
            mediaId: seriesId,
            seasonNumber: sNum,
            episodeNumber: ep.episode_number,
            title: ep.name?.trim() || `Episode ${ep.episode_number}`,
            duration: `${runtime} min`,
            airDate: ep.air_date ? new Date(`${ep.air_date}T00:00:00.000Z`) : null,
            stillUrl: tmdbStill(ep.still_path),
          },
        });
        importedCount++;
      }
    }

    await db.$transaction(async (tx) => {
      await refreshSeasons(tx, seriesId);
    });

    refreshPages();
    return {
      ok: true,
      count: importedCount,
      message: `Imported ${importedCount} episodes.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error importing episodes.",
    };
  }
}

export type SeasonEpisodeRow = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  duration: string;
  airDate?: string | null;
  stillUrl?: string | null;
};

export async function saveSeasonEpisodesAction(
  seriesId: string,
  seasonNumber: number,
  episodes: SeasonEpisodeRow[]
): Promise<{ ok: boolean; message?: string; errors?: Record<string, string> }> {
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  if (!isMediaId(seriesId)) throw new Error("Invalid series ID");

  const errors: Record<string, string> = {};
  const hosts = imageHosts();
  const seen = new Set<number>();

  for (const ep of episodes) {
    if (!ep.title.trim()) {
      errors[`${ep.id}-title`] = "Enter the title.";
    }
    if (!ep.episodeNumber || ep.episodeNumber < 1) {
      errors[`${ep.id}-episodeNumber`] = "Enter a valid episode number.";
    } else if (seen.has(ep.episodeNumber)) {
      errors[`${ep.id}-episodeNumber`] = `Season ${seasonNumber} already has an episode ${ep.episodeNumber}.`;
    } else {
      seen.add(ep.episodeNumber);
    }
    if (ep.stillUrl) {
      const prob = imageUrlProblem(ep.stillUrl, hosts);
      if (prob) {
        errors[`${ep.id}-stillUrl`] = prob;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    const errorMsg = Object.values(errors)[0] ?? "Some fields need fixing.";
    return { ok: false, message: errorMsg, errors };
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.episode.findMany({
      where: { mediaId: seriesId, seasonNumber },
    });
    const existingById = new Map(existing.map((e) => [e.id, e]));

    for (const ep of episodes) {
      const newSlug = `${seriesId}-season-${seasonNumber}-episode-${ep.episodeNumber}`;
      const prev = existingById.get(ep.id);

      if (prev) {
        if (prev.episodeNumber !== ep.episodeNumber) {
          await tx.episodeRedirect.upsert({
            where: { oldSlug: prev.id },
            create: {
              mediaId: seriesId,
              oldSlug: prev.id,
              newSlug,
              oldSeasonNumber: prev.seasonNumber,
              oldEpisodeNumber: prev.episodeNumber,
              newSeasonNumber: seasonNumber,
              newEpisodeNumber: ep.episodeNumber,
            },
            update: {
              newSlug,
              newSeasonNumber: seasonNumber,
              newEpisodeNumber: ep.episodeNumber,
            },
          });
          await tx.$executeRaw`
            UPDATE episode
            SET id = ${newSlug},
                "episodeNumber" = ${ep.episodeNumber},
                title = ${ep.title.trim()},
                duration = ${ep.duration.trim() || '45 min'},
                "airDate" = ${ep.airDate ? new Date(ep.airDate) : null},
                "stillUrl" = ${ep.stillUrl?.trim() || null}
            WHERE id = ${prev.id}
          `;
          await tx.$executeRaw`
            UPDATE video_source
            SET "episodeId" = ${newSlug}
            WHERE "episodeId" = ${prev.id}
          `;
        } else {
          await tx.episode.update({
            where: { id: prev.id },
            data: {
              title: ep.title.trim(),
              duration: ep.duration.trim() || "45 min",
              airDate: ep.airDate ? new Date(ep.airDate) : null,
              stillUrl: ep.stillUrl?.trim() || null,
            },
          });
        }
      } else {
        await tx.episode.create({
          data: {
            id: newSlug,
            mediaId: seriesId,
            seasonNumber,
            episodeNumber: ep.episodeNumber,
            title: ep.title.trim(),
            duration: ep.duration.trim() || "45 min",
            airDate: ep.airDate ? new Date(ep.airDate) : null,
            stillUrl: ep.stillUrl?.trim() || null,
          },
        });
      }
    }

    await refreshSeasons(tx, seriesId);
  });

  refreshPages();
  return { ok: true, message: "Saved." };
}
