"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
import { requireAdmin } from "@/lib/session";
import { formValues, type FormState } from "@/lib/title-form";
import { videoHosts } from "@/lib/video-hosts";
import { MAX_VIDEO_SOURCES, parseVideoSource, VIDEO_SOURCE_FIELDS } from "@/lib/video-source";

/*
 * Server functions behind the Video section of the movie and episode
 * edit pages (src/components/admin/VideoSources.tsx). Like the rest of
 * the editor, each one checks for an admin itself, and checks every
 * argument, the ones bound in the page included.
 */

type Owner = { mediaId: string } | { episodeId: string };

/** Prisma's cuid(). */
const SOURCE_ID = /^[a-z0-9]{20,40}$/;

const GONE = "This movie or episode is in the trash or was deleted.";

function ownerOf(kindArg: unknown, idArg: unknown): Owner {
  if (!isMediaId(idArg)) throw new Error("Invalid id");
  if (kindArg === "movie") return { mediaId: idArg };
  if (kindArg === "episode") return { episodeId: idArg };
  throw new Error("Invalid owner");
}

function sourceId(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_ID.test(value)) throw new Error("Invalid source");
  return value;
}

/** Whether a movie, or an episode's series, exists and isn't in the trash. */
async function canChange(owner: Owner): Promise<boolean> {
  if ("mediaId" in owner) {
    const movie = await db.media.findUnique({
      where: { id: owner.mediaId },
      select: { type: true, trashedAt: true },
    });
    return movie?.type === "movie" && !movie.trashedAt;
  }
  const episode = await db.episode.findUnique({
    where: { id: owner.episodeId },
    select: { media: { select: { trashedAt: true } } },
  });
  return episode !== null && !episode.media.trashedAt;
}

/** A source and what it belongs to, when that can be changed. */
async function changeableSource(id: string) {
  const source = await db.videoSource.findUnique({
    where: { id },
    select: { id: true, mediaId: true, episodeId: true },
  });
  if (!source) return null;
  const owner: Owner = source.mediaId ? { mediaId: source.mediaId } : { episodeId: source.episodeId! };
  return (await canChange(owner)) ? { ...source, owner } : null;
}

/** The watch pages and the admin panel both show sources. */
function refreshPages() {
  revalidatePath("/", "layout");
}

/** "Add a source": the next server tab. The form stays open for another. */
export async function addVideoSource(
  ownerKind: unknown,
  ownerId: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin();
  const owner = ownerOf(ownerKind, ownerId);
  const values = formValues(form, VIDEO_SOURCE_FIELDS);
  if (!(await canChange(owner))) return { message: GONE, values, version: Date.now() };

  const parsed = parseVideoSource(values, videoHosts());
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };

  const added = await db.$transaction(async (tx) => {
    const sources = await tx.videoSource.findMany({ where: owner, select: { position: true } });
    if (sources.length >= MAX_VIDEO_SOURCES) return null;
    const last = Math.max(0, ...sources.map((source) => source.position));
    await tx.videoSource.create({ data: { ...owner, ...parsed.data, position: last + 1 } });
    return sources.length + 1;
  });
  if (added === null) {
    return {
      message: `There can be ${MAX_VIDEO_SOURCES} sources at most. Delete one first.`,
      values,
      version: Date.now(),
    };
  }
  refreshPages();
  return {
    ok: true,
    message: `Added ${parsed.data.label}.`,
    values: { label: `Server ${added + 1}`, kind: "auto", url: "" },
    version: Date.now(),
  };
}

/** A source's Edit form. */
export async function updateVideoSource(
  idArg: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = sourceId(idArg);
  const values = formValues(form, VIDEO_SOURCE_FIELDS);
  if (!(await changeableSource(id))) return { message: GONE, values, version: Date.now() };

  const parsed = parseVideoSource(values, videoHosts());
  if (!parsed.ok) return { errors: parsed.errors, values, version: Date.now() };
  const { count } = await db.videoSource.updateMany({ where: { id }, data: parsed.data });
  if (count === 0) return { message: "This source was deleted.", values, version: Date.now() };
  refreshPages();
  // The link as it was saved: embed code becomes its link.
  return { ok: true, message: "Saved.", values: parsed.data, version: Date.now() };
}

/** Turn off: the player stops offering it, and it's kept for later. */
export async function setVideoSourceEnabled(idArg: unknown, enabledArg: unknown): Promise<void> {
  await requireAdmin();
  const id = sourceId(idArg);
  if (typeof enabledArg !== "boolean") throw new Error("Invalid value");
  if (!(await changeableSource(id))) return;
  await db.videoSource.updateMany({ where: { id }, data: { enabled: enabledArg } });
  refreshPages();
}

/** Swaps a source with the one before ("up") or after ("down") it. */
export async function moveVideoSource(idArg: unknown, directionArg: unknown): Promise<void> {
  await requireAdmin();
  const id = sourceId(idArg);
  if (directionArg !== "up" && directionArg !== "down") throw new Error("Invalid direction");
  const source = await changeableSource(id);
  if (!source) return;

  await db.$transaction(async (tx) => {
    const ids = (
      await tx.videoSource.findMany({
        where: source.owner,
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      })
    ).map((row) => row.id);
    const from = ids.indexOf(id);
    const to = directionArg === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    // Numbered afresh, so positions stay 1, 2, 3… whatever came before.
    for (const [index, rowId] of ids.entries()) {
      await tx.videoSource.update({ where: { id: rowId }, data: { position: index + 1 } });
    }
  });
  refreshPages();
}

/** Deletes a source for good, after the page's confirmation. */
export async function deleteVideoSource(idArg: unknown): Promise<void> {
  await requireAdmin();
  const id = sourceId(idArg);
  if (!(await changeableSource(id))) return;
  await db.videoSource.deleteMany({ where: { id } });
  refreshPages();
}
