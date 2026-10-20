"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { canChange, GONE, ownerOf } from "@/lib/catalog-owner";
import type { FormState } from "@/lib/title-form";
import {
  decodeSubtitleFile,
  isSubtitleLanguage,
  languageName,
  MAX_SUBTITLE_BYTES,
  MAX_SUBTITLES,
  SUBTITLE_ID,
  SUBTITLE_SIZE_PROBLEM,
  SUBTITLE_TYPE_PROBLEM,
  toWebVtt,
} from "@/lib/subtitles";

/*
 * Server functions behind the Subtitles section of the movie and episode
 * edit pages (src/components/admin/Subtitles.tsx). Like the rest of the
 * editor, each one checks for an admin itself, and checks every
 * argument, the ones bound in the page included.
 */

/** A file name to show in the admin panel, from what the browser sent. */
function cleanFileName(file: File): string {
  const name = file.name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name.slice(0, 200) || "subtitles";
}

/**
 * "Upload subtitles": a SubRip or WebVTT file for one language, kept as
 * WebVTT. A file for a language that has one already replaces it.
 */
export async function uploadSubtitle(
  ownerKind: unknown,
  ownerId: unknown,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  const { allowed } = await catalogSession();
  const language = form.get("language");
  const values = { language: typeof language === "string" ? language : "" };
  if (!allowed) return { message: FORBIDDEN_CATALOG, values, version: Date.now() };
  const owner = ownerOf(ownerKind, ownerId);
  if (!(await canChange(owner))) return { message: GONE, values, version: Date.now() };

  const errors: Record<string, string> = {};
  if (!isSubtitleLanguage(language)) errors.language = "Choose the subtitles' language.";
  const file = form.get("file");
  let content: string | null = null;
  if (!(file instanceof File) || file.size === 0) errors.file = "Choose a .srt or .vtt file.";
  else if (file.size > MAX_SUBTITLE_BYTES) errors.file = SUBTITLE_SIZE_PROBLEM;
  else {
    const text = decodeSubtitleFile(new Uint8Array(await file.arrayBuffer()));
    content = text === null ? null : toWebVtt(text);
    if (content === null) errors.file = SUBTITLE_TYPE_PROBLEM;
  }
  if (Object.keys(errors).length > 0 || content === null || !isSubtitleLanguage(language)) {
    return { errors, values, version: Date.now() };
  }

  const saved = await db.$transaction(async (tx) => {
    const existing = await tx.subtitle.findMany({ where: owner, select: { id: true, language: true } });
    const replaced = existing.find((row) => row.language === language);
    if (!replaced && existing.length >= MAX_SUBTITLES) return false;
    if (replaced) await tx.subtitle.delete({ where: { id: replaced.id } });
    await tx.subtitle.create({
      data: { ...owner, language, content, fileName: cleanFileName(file as File) },
    });
    return true;
  });
  if (!saved) {
    return {
      message: `There can be ${MAX_SUBTITLES} languages at most. Delete one first.`,
      values,
      version: Date.now(),
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Added ${languageName(language)} subtitles.`, values: { language: "" }, version: Date.now() };
}

/** Deletes one language's subtitles, after the page's confirmation. */
export async function deleteSubtitle(idArg: unknown): Promise<void> {
  const { allowed } = await catalogSession();
  if (!allowed) return;
  if (typeof idArg !== "string" || !SUBTITLE_ID.test(idArg)) throw new Error("Invalid subtitle");
  const row = await db.subtitle.findUnique({
    where: { id: idArg },
    select: { mediaId: true, episodeId: true },
  });
  if (!row) return;
  const owner = row.mediaId ? { mediaId: row.mediaId } : { episodeId: row.episodeId! };
  if (!(await canChange(owner))) return;
  await db.subtitle.deleteMany({ where: { id: idArg } });
  revalidatePath("/", "layout");
}
