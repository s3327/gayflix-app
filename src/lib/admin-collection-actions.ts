"use server";

import type { Kysely } from "kysely";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity-logger";
import { setAdminFlash } from "@/lib/admin-flash";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import {
  COLLECTION_FIELDS,
  collectionSlug,
  MAX_COLLECTION_ITEMS,
  parseCollection,
} from "@/lib/collection-form";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { isMediaId } from "@/lib/library-types";
import { countOf } from "@/lib/sql-helpers";
import type { FormState } from "@/lib/title-form";

/*
 * Server functions behind /admin/collections (A11): curated collections
 * and the titles in them. Each one checks for a catalog role itself (a
 * direct POST never runs the panel layout); field checks are in
 * src/lib/collection-form.ts. Collections show on the public site (and
 * the home page), so every change refreshes it.
 */

type Session = Awaited<ReturnType<typeof catalogSession>>["session"];

function refreshPages() {
  revalidatePath("/", "layout");
}

function requireId(value: unknown): string {
  if (!isMediaId(value)) throw new Error("Invalid id");
  return value;
}

function getExecutor(val: unknown): Kysely<DB> {
  return typeof val === "object" && val !== null && "selectFrom" in val
    ? (val as Kysely<DB>)
    : database;
}

/** What to show the form again with; checkboxes as "on" or "". */
function formValues(form: FormData): Record<string, string> {
  return {
    ...Object.fromEntries(COLLECTION_FIELDS.map((name) => [name, String(form.get(name) ?? "")])),
    published: form.has("published") ? "on" : "",
    onHome: form.has("onHome") ? "on" : "",
  };
}

async function log(session: Session, action: string, id: string, summary: string) {
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action,
    entityType: "collection",
    entityId: id,
    summary,
  });
}

/** The editor's role, or null after telling them they can't. */
async function editor(): Promise<Session | null> {
  const { session, allowed } = await catalogSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_CATALOG });
    return null;
  }
  return session;
}

/** "New collection": adds one, last in order and unpublished, and opens it. */
export async function createCollection(
  _state: FormState,
  form: FormData,
  executorOrFormData?: Kysely<DB> | unknown
): Promise<FormState> {
  const executor = getExecutor(executorOrFormData);
  const { session, allowed } = await catalogSession();
  const values = formValues(form);
  if (!allowed) return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  const parsed = parseCollection(values, form);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const id = collectionSlug(values.id, parsed.data.title);
  if (!id) {
    return { errors: { id: "Use letters, numbers and dashes, like pride-month." }, values, version: Date.now() };
  }
  const existing = await executor
    .selectFrom("collection")
    .select("id")
    .where("id", "=", id)
    .executeTakeFirst();
  if (existing) {
    return { errors: { id: "Another collection has that address." }, values, version: Date.now() };
  }
  const last = await executor
    .selectFrom("collection")
    .select((eb) => eb.fn.max("position").as("maxPosition"))
    .executeTakeFirst();
  const position = ((last?.maxPosition as number | null) ?? -1) + 1;
  try {
    await executor
      .insertInto("collection")
      .values({
        id,
        title: parsed.data.title,
        description: parsed.data.description,
        published: parsed.data.published,
        onHome: parsed.data.onHome,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        position,
      })
      .execute();
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "23505") {
      return { errors: { id: "Another collection has that address." }, values, version: Date.now() };
    }
    throw error;
  }
  await log(session, "collection.create", id, `Created collection "${parsed.data.title}"`);
  refreshPages();
  redirect(`/admin/collections/${id}`);
}

/** The edit page's form. A collection's address doesn't change. */
export async function updateCollection(
  idArg: unknown,
  _state: FormState,
  form: FormData,
  executorOrFormData?: Kysely<DB> | unknown
): Promise<FormState> {
  const executor = getExecutor(executorOrFormData);
  const { session, allowed } = await catalogSession();
  const values = formValues(form);
  if (!allowed) return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  const id = requireId(idArg);
  const parsed = parseCollection(values, form);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const result = await executor
    .updateTable("collection")
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      published: parsed.data.published,
      onHome: parsed.data.onHome,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      updatedAt: new Date(),
    })
    .where("id", "=", id)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) === 0) {
    return { message: "This collection was deleted.", values, version: Date.now() };
  }
  await log(session, "collection.update", id, `Saved collection "${parsed.data.title}"`);
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

/** Deletes a collection (its titles stay in the library). */
export async function deleteCollection(
  idArg: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const executor = getExecutor(executorOrFormData);
  const deleted = await executor
    .deleteFrom("collection")
    .where("id", "=", id)
    .returning("title")
    .executeTakeFirst();
  if (deleted) await log(session, "collection.delete", id, `Deleted collection "${deleted.title}"`);
  refreshPages();
  await setAdminFlash({ message: deleted ? `Deleted "${deleted.title}".` : "That collection was already gone." });
  redirect("/admin/collections");
}

/** Moves a collection up or down the order (/collections and the home page). */
export async function moveCollection(
  idArg: unknown,
  direction: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  if (direction !== "up" && direction !== "down") throw new Error("Invalid direction");
  const executor = getExecutor(executorOrFormData);
  const rows = await executor
    .selectFrom("collection")
    .select("id")
    .orderBy("position", "asc")
    .orderBy("title", "asc")
    .execute();
  const ids = reorder(rows.map((row) => row.id), id, direction);
  if (!ids) return;

  const updatePositions = async (tx: Kysely<DB>) => {
    for (let position = 0; position < ids.length; position++) {
      await tx
        .updateTable("collection")
        .set({ position })
        .where("id", "=", ids[position])
        .execute();
    }
  };

  if (executor.isTransaction) {
    await updatePositions(executor);
  } else {
    await executor.transaction().execute(updatePositions);
  }

  await log(session, "collection.reorder", id, `Moved collection ${direction}`);
  refreshPages();
}

/** `ids` with `id` swapped with its neighbor, or null if it can't move that way. */
function reorder(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Adds a title at the end of a collection. Adding it again changes nothing. */
export async function addToCollection(
  idArg: unknown,
  mediaIdArg: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const mediaId = requireId(mediaIdArg);
  const executor = getExecutor(executorOrFormData);
  const [colExists, mediaExists] = await Promise.all([
    executor.selectFrom("collection").select("id").where("id", "=", id).executeTakeFirst(),
    executor.selectFrom("media").select("id").where("id", "=", mediaId).executeTakeFirst(),
  ]);
  if (!colExists || !mediaExists) return;
  const stats = await executor
    .selectFrom("collection_item")
    .select((eb) => [
      eb.fn.countAll().as("count"),
      eb.fn.max("position").as("maxPosition"),
    ])
    .where("collectionId", "=", id)
    .executeTakeFirst();
  if (countOf(stats ?? { count: 0 }) >= MAX_COLLECTION_ITEMS) {
    await setAdminFlash({ message: `A collection holds up to ${MAX_COLLECTION_ITEMS} titles.` });
    return;
  }
  try {
    const nextPosition = ((stats?.maxPosition as number | null) ?? -1) + 1;
    await executor
      .insertInto("collection_item")
      .values({
        collectionId: id,
        mediaId,
        position: nextPosition,
      })
      .onConflict((oc) => oc.columns(["collectionId", "mediaId"]).doNothing())
      .execute();
  } catch (error: unknown) {
    // No such title or collection (foreign key violation)
    if ((error as { code?: string })?.code === "23503") return;
    throw error;
  }
  await log(session, "collection.add_title", id, `Added "${mediaId}" to a collection`);
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
}

export async function removeFromCollection(
  idArg: unknown,
  mediaIdArg: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const mediaId = requireId(mediaIdArg);
  const executor = getExecutor(executorOrFormData);
  await executor
    .deleteFrom("collection_item")
    .where("collectionId", "=", id)
    .where("mediaId", "=", mediaId)
    .execute();
  await log(session, "collection.remove_title", id, `Took "${mediaId}" out of a collection`);
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
}

/** Moves a title up or down in its collection. */
export async function moveInCollection(
  idArg: unknown,
  mediaIdArg: unknown,
  direction: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const mediaId = requireId(mediaIdArg);
  if (direction !== "up" && direction !== "down") throw new Error("Invalid direction");
  const executor = getExecutor(executorOrFormData);
  const rows = await executor
    .selectFrom("collection_item")
    .select("mediaId")
    .where("collectionId", "=", id)
    .orderBy("position", "asc")
    .orderBy("addedAt", "asc")
    .execute();
  const ids = reorder(rows.map((row) => row.mediaId), mediaId, direction);
  if (!ids) return;

  const updatePositions = async (tx: Kysely<DB>) => {
    for (let position = 0; position < ids.length; position++) {
      await tx
        .updateTable("collection_item")
        .set({ position })
        .where("collectionId", "=", id)
        .where("mediaId", "=", ids[position])
        .execute();
    }
  };

  if (executor.isTransaction) {
    await updatePositions(executor);
  } else {
    await executor.transaction().execute(updatePositions);
  }

  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
}
