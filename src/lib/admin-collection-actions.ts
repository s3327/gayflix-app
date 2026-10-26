"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/lib/activity-logger";
import { setAdminFlash } from "@/lib/admin-flash";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import {
  COLLECTION_FIELDS,
  collectionSlug,
  MAX_COLLECTION_ITEMS,
  parseCollection,
} from "@/lib/collection-form";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
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
export async function createCollection(_state: FormState, form: FormData): Promise<FormState> {
  const { session, allowed } = await catalogSession();
  const values = formValues(form);
  if (!allowed) return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  const parsed = parseCollection(values, form);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const id = collectionSlug(values.id, parsed.data.title);
  if (!id) {
    return { errors: { id: "Use letters, numbers and dashes, like pride-month." }, values, version: Date.now() };
  }
  const last = await db.collection.aggregate({ _max: { position: true } });
  try {
    await db.collection.create({
      data: { id, ...parsed.data, position: (last._max.position ?? -1) + 1 },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
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
  form: FormData
): Promise<FormState> {
  const { session, allowed } = await catalogSession();
  const values = formValues(form);
  if (!allowed) return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  const id = requireId(idArg);
  const parsed = parseCollection(values, form);
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const { count } = await db.collection.updateMany({ where: { id }, data: parsed.data });
  if (count === 0) return { message: "This collection was deleted.", values, version: Date.now() };
  await log(session, "collection.update", id, `Saved collection "${parsed.data.title}"`);
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
  return { ok: true, message: "Saved.", values, version: Date.now() };
}

/** Deletes a collection (its titles stay in the library). */
export async function deleteCollection(idArg: unknown): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const deleted = await db.collection.delete({ where: { id }, select: { title: true } }).catch(() => null);
  if (deleted) await log(session, "collection.delete", id, `Deleted collection "${deleted.title}"`);
  refreshPages();
  await setAdminFlash({ message: deleted ? `Deleted "${deleted.title}".` : "That collection was already gone." });
  redirect("/admin/collections");
}

/** Moves a collection up or down the order (/collections and the home page). */
export async function moveCollection(idArg: unknown, direction: unknown): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  if (direction !== "up" && direction !== "down") throw new Error("Invalid direction");
  const rows = await db.collection.findMany({
    orderBy: [{ position: "asc" }, { title: "asc" }],
    select: { id: true },
  });
  const ids = reorder(rows.map((row) => row.id), id, direction);
  if (!ids) return;
  await db.$transaction(ids.map((each, position) => db.collection.update({ where: { id: each }, data: { position } })));
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
export async function addToCollection(idArg: unknown, mediaIdArg: unknown): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const mediaId = requireId(mediaIdArg);
  const items = await db.collectionItem.aggregate({
    where: { collectionId: id },
    _count: true,
    _max: { position: true },
  });
  if (items._count >= MAX_COLLECTION_ITEMS) {
    await setAdminFlash({ message: `A collection holds up to ${MAX_COLLECTION_ITEMS} titles.` });
    return;
  }
  try {
    await db.collectionItem.upsert({
      where: { collectionId_mediaId: { collectionId: id, mediaId } },
      create: { collectionId: id, mediaId, position: (items._max.position ?? -1) + 1 },
      update: {},
    });
  } catch (error) {
    // No such title or collection.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return;
    throw error;
  }
  await log(session, "collection.add_title", id, `Added "${mediaId}" to a collection`);
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
}

export async function removeFromCollection(idArg: unknown, mediaIdArg: unknown): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const mediaId = requireId(mediaIdArg);
  await db.collectionItem.deleteMany({ where: { collectionId: id, mediaId } });
  await log(session, "collection.remove_title", id, `Took "${mediaId}" out of a collection`);
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
}

/** Moves a title up or down in its collection. */
export async function moveInCollection(idArg: unknown, mediaIdArg: unknown, direction: unknown): Promise<void> {
  const session = await editor();
  if (!session) return;
  const id = requireId(idArg);
  const mediaId = requireId(mediaIdArg);
  if (direction !== "up" && direction !== "down") throw new Error("Invalid direction");
  const rows = await db.collectionItem.findMany({
    where: { collectionId: id },
    orderBy: [{ position: "asc" }, { addedAt: "asc" }],
    select: { mediaId: true },
  });
  const ids = reorder(rows.map((row) => row.mediaId), mediaId, direction);
  if (!ids) return;
  await db.$transaction(
    ids.map((each, position) =>
      db.collectionItem.update({
        where: { collectionId_mediaId: { collectionId: id, mediaId: each } },
        data: { position },
      })
    )
  );
  refreshPages();
  revalidatePath(`/admin/collections/${id}`);
}
