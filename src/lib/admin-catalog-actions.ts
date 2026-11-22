"use server";

import type { Kysely, Transaction } from "kysely";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { setAdminFlash } from "@/lib/admin-flash";
import { logActivity } from "@/lib/activity-logger";
import { findImported } from "@/lib/catalog";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { buildDefaultEpisodeEmbedUrl } from "@/lib/embed-builder";
import { imageHosts } from "@/lib/image-hosts.mjs";
import { isImdbId, isTmdbId, parseTmdbRef, tmdbEpisodeSynopsis, tmdbStill } from "@/lib/import-mapping";
import { isMediaId } from "@/lib/library-types";
import type { MediaStatus, MediaType } from "@/lib/media";
import { countOf } from "@/lib/sql-helpers";
import {
  EPISODE_FIELDS,
  TITLE_FIELDS,
  bulkTagsProblem,
  episodeDuration,
  episodeId,
  formValues,
  libraryPath,
  parseBulkTags,
  parseEpisode,
  parseQuickEdit,
  parseSeasonRows,
  parseTitle,
  seriesDuration,
  splitList,
  type FormState,
} from "@/lib/title-form";
import { createTitleRevision } from "@/lib/title-revisions";
import {
  freeId,
  insertTitle,
  isUniqueViolation,
  titleData,
  unfeatureOthers,
  type SourceIds,
  type Tx,
} from "@/lib/title-store";
import { getTmdbDetails, getTmdbSeasonDetails } from "@/lib/tmdb";
import { videoHosts, videoUrlAllowed } from "@/lib/video-hosts";

/*
 * Server functions behind the admin title editor. Each one checks for an
 * admin itself (a direct POST never runs the panel layout), and checks
 * every argument, the ones bound in the page included: the browser sends
 * those back too.
 */

function getExecutor(val: unknown): Kysely<DB> | Transaction<DB> {
  return typeof val === "object" && val !== null && "selectFrom" in val
    ? (val as Kysely<DB> | Transaction<DB>)
    : database;
}

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
  return mediaIds(form.getAll("ids"));
}

/** Title ids sent by the browser: valid ones only, each once, at most MAX_SELECTED. */
function mediaIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isMediaId))].slice(0, MAX_SELECTED);
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
  form: FormData,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<FormState> {
  const executor = getExecutor(executorOrUnknown);
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
  const id = await insertTitle(type, parsed.data, sources, executor);
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
  form: FormData,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<FormState> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  const values = formValues(form, TITLE_FIELDS);
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
  const id = itemId(idArg);
  const loadedAt = form.get("loadedAt");
  const gone = { message: "This title is in the trash or was deleted.", values, version: Date.now() };
  const existing = await executor
    .selectFrom("media")
    .select(["type", "status", "publishedAt", "trashedAt", "updatedAt"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!existing || existing.trashedAt) return gone;

  if (typeof loadedAt === "string" && loadedAt) {
    const loadedDate = new Date(loadedAt);
    const existingUpdatedAt = new Date(existing.updatedAt);
    if (!isNaN(loadedDate.getTime()) && existingUpdatedAt.getTime() > loadedDate.getTime()) {
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
  await createTitleRevision(
    {
      mediaId: id,
      actorId: session.user.id,
      actorEmail: session.user.email,
      summary: `Updated title metadata for "${parsed.data.title}"`,
    },
    executor as Kysely<DB>
  );

  // Kept from the first time it was published.
  const shouldSetPublishedAt = parsed.data.status === "published" && existing.publishedAt === null;

  const runSave = async (tx: Transaction<DB> | Kysely<DB>) => {
    // Not if it was trashed meanwhile: a trashed title must stay a draft.
    const result = await tx
      .updateTable("media")
      .set({
        ...titleData(existing.type, parsed.data),
        ...(shouldSetPublishedAt ? { publishedAt: new Date() } : {}),
        ...(parsed.data.status === "published" ? { publishAt: null } : {}),
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .where("trashedAt", "is", null)
      .executeTakeFirst();
    const count = Number(result.numUpdatedRows);
    if (count > 0 && parsed.data.featured && parsed.data.status === "published") {
      await unfeatureOthers(tx, id);
    }
    return count > 0;
  };

  const saved = executor.isTransaction
    ? await runSave(executor)
    : await executor.transaction().execute(runSave);
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

/**
 * Sets the status of titles not in the trash, and returns the ids whose
 * status changed: an Undo puts back only those.
 */
export async function updateMediaStatusBatch(
  idsArg: unknown,
  statusArg: unknown,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<string[]> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  const ids = mediaIds(idsArg);
  if (!allowed || ids.length === 0) return [];
  const status = mediaStatus(statusArg);

  const runBatch = async (tx: Transaction<DB> | Kysely<DB>) => {
    const changing = await tx
      .selectFrom("media")
      .select("id")
      .where("id", "in", ids)
      .where("trashedAt", "is", null)
      .where("status", "!=", status)
      .execute();

    if (status === "published") {
      await tx
        .updateTable("media")
        .set({ status, publishAt: null, updatedAt: new Date() })
        .where("id", "in", ids)
        .where("trashedAt", "is", null)
        .execute();

      await tx
        .updateTable("media")
        .set({ publishedAt: new Date(), updatedAt: new Date() })
        .where("id", "in", ids)
        .where("trashedAt", "is", null)
        .where("publishedAt", "is", null)
        .execute();

      const featured = await tx
        .selectFrom("media")
        .select("id")
        .where("id", "in", ids)
        .where("trashedAt", "is", null)
        .where("featured", "=", true)
        .executeTakeFirst();

      if (featured) {
        await unfeatureOthers(tx, featured.id);
      }
    } else {
      await tx
        .updateTable("media")
        .set({ status, updatedAt: new Date() })
        .where("id", "in", ids)
        .where("trashedAt", "is", null)
        .execute();
    }
    return changing.map((item) => item.id);
  };

  const changed = executor.isTransaction
    ? await runBatch(executor)
    : await executor.transaction().execute(runBatch);

  refreshPages();
  return changed;
}

/** Publish or unpublish one title (a library row's button). */
export async function setTitleStatus(
  idArg: unknown,
  statusArg: unknown,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  const status = mediaStatus(statusArg);
  const changed = await updateMediaStatusBatch([id], status, executor);
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
    ...(changed.length > 0 && {
      undo: { label: "Undo", action: isPub ? "unpublish_media" : "publish_media", ids: changed },
    }),
  });
}

/** Publish or unpublish the checked rows. */
export async function setSelectedStatus(
  statusArg: unknown,
  form: FormData,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  const status = mediaStatus(statusArg);
  // Undo puts back only the titles this changed, not ones already in that state.
  const changed = await updateMediaStatusBatch(ids, status, executor);
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
    ...(changed.length > 0 && {
      undo: { label: "Undo", action: isPub ? "unpublish_media" : "publish_media", ids: changed },
    }),
  });
}

/**
 * Trashed titles become drafts, so the public site drops them at once,
 * and stop being featured. They can be restored (as drafts) or deleted
 * for good from /admin/trash.
 */
async function moveToTrash(ids: string[], executor: Kysely<DB> | Transaction<DB> = database) {
  if (ids.length === 0) return;
  const runMove = async (tx: Transaction<DB> | Kysely<DB>) => {
    const items = await tx
      .selectFrom("media")
      .select(["id", "status", "featured"])
      .where("id", "in", ids)
      .where("trashedAt", "is", null)
      .execute();
    for (const item of items) {
      await tx
        .updateTable("media")
        .set({
          statusBeforeTrash: item.status,
          featuredBeforeTrash: item.featured,
          status: "draft",
          featured: false,
          trashedAt: new Date(),
          updatedAt: new Date(),
        })
        .where("id", "=", item.id)
        .execute();
    }
  };

  if (executor.isTransaction) {
    await runMove(executor);
  } else {
    await executor.transaction().execute(runMove);
  }
  refreshPages();
}

export async function trashTitle(idArg: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  await moveToTrash([id], executor);
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

export async function trashSelected(form: FormData, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  await moveToTrash(ids, executor);
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
export async function restoreTitle(idArg: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  const runRestore = async (tx: Transaction<DB> | Kysely<DB>) => {
    const item = await tx
      .selectFrom("media")
      .select(["statusBeforeTrash", "featuredBeforeTrash", "trashedAt"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!item || !item.trashedAt) return;
    const restoredStatus = item.statusBeforeTrash ?? "draft";
    const restoredFeatured = item.featuredBeforeTrash ?? false;

    await tx
      .updateTable("media")
      .set({
        status: restoredStatus,
        featured: restoredFeatured,
        statusBeforeTrash: null,
        featuredBeforeTrash: null,
        trashedAt: null,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .execute();

    if (restoredFeatured && restoredStatus === "published") {
      await unfeatureOthers(tx, id);
    }
  };

  if (executor.isTransaction) {
    await runRestore(executor);
  } else {
    await executor.transaction().execute(runRestore);
  }

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
export async function deleteTitle(idArg: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  await executor
    .deleteFrom("media")
    .where("id", "=", id)
    .where("trashedAt", "is not", null)
    .execute();
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
export async function bulkRestoreTrash(form: FormData, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  const runBulkRestore = async (tx: Transaction<DB> | Kysely<DB>) => {
    const done: string[] = [];
    for (const id of ids) {
      const item = await tx
        .selectFrom("media")
        .select(["statusBeforeTrash", "featuredBeforeTrash", "trashedAt"])
        .where("id", "=", id)
        .executeTakeFirst();
      if (!item || !item.trashedAt) continue;
      done.push(id);
      const restoredStatus = item.statusBeforeTrash ?? "draft";
      const restoredFeatured = item.featuredBeforeTrash ?? false;

      await tx
        .updateTable("media")
        .set({
          status: restoredStatus,
          featured: restoredFeatured,
          statusBeforeTrash: null,
          featuredBeforeTrash: null,
          trashedAt: null,
          updatedAt: new Date(),
        })
        .where("id", "=", id)
        .execute();

      if (restoredFeatured && restoredStatus === "published") {
        await unfeatureOthers(tx, id);
      }
    }
    return done;
  };

  const restored = executor.isTransaction
    ? await runBulkRestore(executor)
    : await executor.transaction().execute(runBulkRestore);

  refreshPages();
  if (restored.length > 0) {
    await logActivity({
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: "title.restore",
      entityType: "media",
      entityId: restored.join(","),
      summary: `Restored ${restored.length} titles from trash`,
    });
  }
  await setAdminFlash({
    message: `${restored.length} ${restored.length === 1 ? "title" : "titles"} restored.`,
    // Undo sends them back to the trash.
    ...(restored.length > 0 && {
      undo: { label: "Undo", action: "trash_media", ids: restored },
    }),
  });
}

/** Undo of a restore: back to the trash. */
export async function trashTitles(idsArg: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) return;
  await moveToTrash(mediaIds(idsArg), executor);
}

/** Permanently delete multiple checked titles from trash. */
export async function bulkDeleteForGoodTrash(form: FormData, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const ids = selectedIds(form);
  if (ids.length === 0) return;
  await executor
    .deleteFrom("media")
    .where("id", "in", ids)
    .where("trashedAt", "is not", null)
    .execute();
  refreshPages();
  await setAdminFlash({
    message: `${ids.length} ${ids.length === 1 ? "title" : "titles"} deleted permanently.`,
  });
}

/** Quick inline metadata update without leaving the library page. */
export async function quickUpdateTitle(input: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<{ ok: boolean; message?: string }> {
  const executor = getExecutor(executorOrUnknown);
  const { session, allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const id = typeof input === "object" && input !== null ? (input as { id?: unknown }).id : undefined;
  if (!isMediaId(id)) return { ok: false, message: "Invalid title ID" };
  const existing = await executor
    .selectFrom("media")
    .select(["type", "featured", "publishedAt", "trashedAt"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!existing || existing.trashedAt) return { ok: false, message: "Title not found or in trash" };
  const parsed = parseQuickEdit(input, existing.type);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const { title, year, status, duration, genres, tagline, rating } = parsed.data;

  // Save revision snapshot before applying quick updates
  await createTitleRevision(
    {
      mediaId: id,
      actorId: session.user.id,
      actorEmail: session.user.email,
      summary: `Quick edited metadata for "${title}"`,
    },
    executor as Kysely<DB>
  );

  const runQuick = async (tx: Transaction<DB> | Kysely<DB>) => {
    const result = await tx
      .updateTable("media")
      .set({
        title,
        year,
        status,
        ...(duration ? { duration } : {}),
        ...(genres ? { genres } : {}),
        ...(tagline !== undefined ? { tagline } : {}),
        ...(rating !== undefined ? { rating } : {}),
        // Kept from the first time it was published.
        ...(status === "published" && existing.publishedAt === null ? { publishedAt: new Date() } : {}),
        ...(status === "published" ? { publishAt: null } : {}),
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .where("trashedAt", "is", null)
      .executeTakeFirst();
    const count = Number(result.numUpdatedRows);
    if (count > 0 && existing.featured && status === "published") await unfeatureOthers(tx, id);
  };

  if (executor.isTransaction) {
    await runQuick(executor);
  } else {
    await executor.transaction().execute(runQuick);
  }

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "title.quick_edit",
    entityType: "media",
    entityId: id,
    summary: `Quick edited "${title}"`,
    details: { title, year, status },
  });

  refreshPages();
  return { ok: true };
}

/** Batch add or remove tags and genres across multiple selected titles. */
export async function bulkTagTitles(input: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<{ ok: boolean; count: number; message?: string }> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, count: 0, message: FORBIDDEN_CATALOG };
  const raw = typeof input === "object" && input !== null ? (input as { ids?: unknown }) : {};
  const ids = mediaIds(raw.ids);
  if (ids.length === 0) return { ok: true, count: 0 };
  const parsed = parseBulkTags(input);
  if (!parsed.ok) return { ok: false, count: 0, message: parsed.message };
  const { addTags, removeTags, addGenres, removeGenres } = parsed.data;
  const removing = (list: string[]) => new Set(list.map((item) => item.toLowerCase()));
  const removeTagSet = removing(removeTags);
  const removeGenreSet = removing(removeGenres);

  const items = await executor
    .selectFrom("media")
    .select(["id", "title", "tags", "genres"])
    .where("id", "in", ids)
    .where("trashedAt", "is", null)
    .execute();
  const changes = items.map((item) => ({
    item,
    tags: splitList([...(item.tags ?? []), ...addTags].join(",")).filter((t) => !removeTagSet.has(t.toLowerCase())),
    genres: splitList([...(item.genres ?? []), ...addGenres].join(",")).filter((g) => !removeGenreSet.has(g.toLowerCase())),
  }));
  for (const { item, tags, genres } of changes) {
    const problem = bulkTagsProblem(tags, genres);
    if (problem) return { ok: false, count: 0, message: `${item.title}: ${problem}` };
  }

  const runBulkTag = async (tx: Transaction<DB> | Kysely<DB>) => {
    for (const { item, tags, genres } of changes) {
      await tx
        .updateTable("media")
        .set({ tags, genres, updatedAt: new Date() })
        .where("id", "=", item.id)
        .execute();
    }
  };

  if (executor.isTransaction) {
    await runBulkTag(executor);
  } else {
    await executor.transaction().execute(runBulkTag);
  }

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
  const row = await tx
    .selectFrom("episode")
    .select((eb) => eb.fn.count<number>("seasonNumber").distinct().as("count"))
    .where("mediaId", "=", seriesId)
    .executeTakeFirst();
  const count = row ? countOf(row) : 0;
  await tx
    .updateTable("media")
    .set({ duration: seriesDuration(count), updatedAt: new Date() })
    .where("id", "=", seriesId)
    .execute();
}

const SERIES_IN_TRASH = "Its series is in the trash. Restore the series to change its episodes.";

function takenMessage(season: number, episode: number) {
  return `Season ${season} already has an episode ${episode}.`;
}

/**
 * "Add an episode". Stays on the form, ready for the next episode of the
 * same season.
 */
export async function createEpisode(
  _state: FormState,
  form: FormData,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<FormState> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  const values = formValues(form, EPISODE_FIELDS);
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
  const parsed = parseEpisode(values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const { seriesId, seasonNumber, episodeNumber, title, minutes, airDate, synopsis } = parsed.data;

  const series = await executor
    .selectFrom("media")
    .select(["type", "trashedAt", "imdbId", "tmdbId"])
    .where("id", "=", seriesId)
    .executeTakeFirst();
  if (series?.type !== "series" || series.trashedAt) {
    return { errors: { series: "Choose the series." }, values, version: Date.now() };
  }
  const taken = await executor
    .selectFrom("episode")
    .select("id")
    .where("mediaId", "=", seriesId)
    .where("seasonNumber", "=", seasonNumber)
    .where("episodeNumber", "=", episodeNumber)
    .executeTakeFirst();
  if (taken) {
    return { errors: { episode: takenMessage(seasonNumber, episodeNumber) }, values, version: Date.now() };
  }

  const id = await freeId(episodeId(seriesId, seasonNumber, episodeNumber), executor);
  try {
    const runCreate = async (tx: Transaction<DB> | Kysely<DB>) => {
      await tx
        .insertInto("episode")
        .values({
          id,
          mediaId: seriesId,
          seasonNumber,
          episodeNumber,
          title,
          duration: episodeDuration(minutes),
          airDate,
          synopsis,
        })
        .execute();

      const defaultEmbedUrl = buildDefaultEpisodeEmbedUrl({
        imdbId: series.imdbId,
        tmdbId: series.tmdbId,
        seasonNumber,
        episodeNumber,
      });
      if (defaultEmbedUrl) {
        await tx
          .insertInto("video_source")
          .values({
            episodeId: id,
            label: "Server 1",
            kind: "embed",
            url: defaultEmbedUrl,
            position: 1,
            enabled: true,
          })
          .execute();
      }

      await refreshSeasons(tx, seriesId);
    };

    if (executor.isTransaction) {
      await runCreate(executor);
    } else {
      await executor.transaction().execute(runCreate);
    }
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
  form: FormData,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<FormState> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  const id = itemId(idArg);
  const existing = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select(["episode.mediaId as mediaId", "media.trashedAt as mediaTrashedAt"])
    .where("episode.id", "=", id)
    .executeTakeFirst();
  const values = { ...formValues(form, EPISODE_FIELDS), series: existing?.mediaId ?? "" };
  if (!allowed) {
    return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  }
  if (!existing) return { message: "This episode was deleted.", values, version: Date.now() };
  if (existing.mediaTrashedAt) return { message: SERIES_IN_TRASH, values, version: Date.now() };

  const parsed = parseEpisode(values);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const { seasonNumber, episodeNumber, title, minutes, airDate, synopsis } = parsed.data;
  try {
    const runUpdate = async (tx: Transaction<DB> | Kysely<DB>) => {
      await tx
        .updateTable("episode")
        .set({
          seasonNumber,
          episodeNumber,
          title,
          duration: episodeDuration(minutes),
          airDate,
          synopsis,
        })
        .where("id", "=", id)
        .execute();
      await refreshSeasons(tx, existing.mediaId);
    };

    if (executor.isTransaction) {
      await runUpdate(executor);
    } else {
      await executor.transaction().execute(runUpdate);
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { errors: { episode: takenMessage(seasonNumber, episodeNumber) }, values, version: Date.now() };
  }
  refreshPages();
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

/** Deletes an episode for good, then opens its series' edit page. */
export async function deleteEpisode(idArg: unknown, executorOrUnknown?: Kysely<DB> | unknown): Promise<void> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return;
  }
  const id = itemId(idArg);
  const episode = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select(["episode.mediaId as mediaId", "media.trashedAt as mediaTrashedAt"])
    .where("episode.id", "=", id)
    .executeTakeFirst();
  if (!episode) redirect("/admin/library/episodes");
  // Like the series itself: restored before it's changed.
  if (episode.mediaTrashedAt) redirect(`/admin/library/episodes/${id}`);
  const runDelete = async (tx: Transaction<DB> | Kysely<DB>) => {
    await tx.deleteFrom("episode").where("id", "=", id).execute();
    await refreshSeasons(tx, episode.mediaId);
  };
  if (executor.isTransaction) {
    await runDelete(executor);
  } else {
    await executor.transaction().execute(runDelete);
  }
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
  seriesId: string,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<{ ok: boolean; seasons?: TmdbSeasonInfo[]; message?: string }> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const series = await executor
    .selectFrom("media")
    .select("tmdbId")
    .where("id", "=", seriesId)
    .executeTakeFirst();
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
  seasonNumber: number,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<{
  ok: boolean;
  episodes?: { episodeNumber: number; title: string; runtime: string; stillUrl: string | null }[];
  message?: string;
}> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const series = await executor
    .selectFrom("media")
    .select("tmdbId")
    .where("id", "=", seriesId)
    .executeTakeFirst();
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
  seasonNumbers: number[],
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<{ ok: boolean; count?: number; message?: string }> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  if (!Array.isArray(seasonNumbers) || seasonNumbers.length === 0) {
    return { ok: false, message: "Select at least one season." };
  }
  const series = await executor
    .selectFrom("media")
    .select(["id", "type", "tmdbId", "imdbId", "trashedAt"])
    .where("id", "=", seriesId)
    .executeTakeFirst();
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

      const existingEpisodes = await executor
        .selectFrom("episode")
        .select("episodeNumber")
        .where("mediaId", "=", seriesId)
        .where("seasonNumber", "=", sNum)
        .execute();
      const existingSet = new Set(existingEpisodes.map((e) => e.episodeNumber));

      const missing = seasonData.episodes.filter((ep) => !existingSet.has(ep.episode_number));

      for (const ep of missing) {
        const id = `${seriesId}-season-${sNum}-episode-${ep.episode_number}`;
        const runtime = ep.runtime && ep.runtime > 0 ? ep.runtime : 45;
        await executor
          .insertInto("episode")
          .values({
            id,
            mediaId: seriesId,
            seasonNumber: sNum,
            episodeNumber: ep.episode_number,
            title: ep.name?.trim() || `Episode ${ep.episode_number}`,
            duration: `${runtime} min`,
            airDate: ep.air_date ? new Date(`${ep.air_date}T00:00:00.000Z`) : null,
            stillUrl: tmdbStill(ep.still_path),
            synopsis: tmdbEpisodeSynopsis(ep.overview),
          })
          .execute();

        const defaultEmbedUrl = buildDefaultEpisodeEmbedUrl({
          imdbId: series.imdbId,
          tmdbId: ref.id,
          seasonNumber: sNum,
          episodeNumber: ep.episode_number,
        });
        if (defaultEmbedUrl) {
          await executor
            .insertInto("video_source")
            .values({
              episodeId: id,
              label: "Server 1",
              kind: "embed",
              url: defaultEmbedUrl,
              position: 1,
              enabled: true,
            })
            .execute();
        }

        importedCount++;
      }
    }

    const runRefresh = async (tx: Transaction<DB> | Kysely<DB>) => {
      await refreshSeasons(tx, seriesId);
    };

    if (executor.isTransaction) {
      await runRefresh(executor);
    } else {
      await executor.transaction().execute(runRefresh);
    }

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

/**
 * Saves a season's table editor. Episodes keep their ids (their addresses)
 * when renumbered, like the episode edit page, so their video sources,
 * watch history and links stay with them. Numbers can be swapped or
 * shifted in one save.
 */
export async function saveSeasonEpisodesAction(
  seriesIdArg: unknown,
  seasonArg: unknown,
  episodesArg: unknown,
  executorOrUnknown?: Kysely<DB> | unknown
): Promise<{ ok: boolean; message?: string; errors?: Record<string, string> }> {
  const executor = getExecutor(executorOrUnknown);
  const { allowed } = await catalogSession();
  if (!allowed) return { ok: false, message: FORBIDDEN_CATALOG };
  const seriesId = itemId(seriesIdArg);
  const parsed = parseSeasonRows(seasonArg, episodesArg, imageHosts());
  if (!parsed.ok) return { ok: false, message: parsed.message, errors: parsed.errors };
  const { seasonNumber, rows } = parsed;

  const series = await executor
    .selectFrom("media")
    .select(["type", "trashedAt"])
    .where("id", "=", seriesId)
    .executeTakeFirst();
  if (!series || series.type !== "series") return { ok: false, message: "This series was deleted." };
  if (series.trashedAt) return { ok: false, message: SERIES_IN_TRASH };

  const OUT_OF_DATE = "This season changed since the page loaded. Reload the page and try again.";
  try {
    const runSave = async (tx: Transaction<DB> | Kysely<DB>) => {
      const rowIds = rows.map((row) => row.id);
      const existing = await tx
        .selectFrom("episode")
        .select("id")
        .where("mediaId", "=", seriesId)
        .where("seasonNumber", "=", seasonNumber)
        .where("id", "in", rowIds)
        .execute();
      if (existing.length !== rows.length) throw new Error(OUT_OF_DATE);

      // Out of the way first (negative numbers no episode uses), so a swap
      // or a shift doesn't trip over the one-number-per-episode rule.
      for (const [index, row] of rows.entries()) {
        await tx
          .updateTable("episode")
          .set({ episodeNumber: -(index + 1) })
          .where("id", "=", row.id)
          .execute();
      }
      for (const row of rows) {
        await tx
          .updateTable("episode")
          .set({
            episodeNumber: row.episodeNumber,
            title: row.title,
            duration: episodeDuration(row.minutes),
            airDate: row.airDate,
            stillUrl: row.stillUrl,
          })
          .where("id", "=", row.id)
          .execute();
      }
      await refreshSeasons(tx, seriesId);
    };

    if (executor.isTransaction) {
      await runSave(executor);
    } else {
      await executor.transaction().execute(runSave);
    }
  } catch (error) {
    if (error instanceof Error && error.message === OUT_OF_DATE) return { ok: false, message: OUT_OF_DATE };
    if (!isUniqueViolation(error)) throw error;
    return { ok: false, message: "Another episode of this season already has one of those numbers." };
  }

  refreshPages();
  return { ok: true, message: "Saved." };
}
