"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseTmdbRef } from "@/lib/import-mapping";
import { requireAdmin } from "@/lib/session";
import { libraryPath, uploadPath } from "@/lib/title-form";
import { prepareImport, type ImportState } from "@/lib/title-import";
import { insertTitle } from "@/lib/title-store";

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
  await requireAdmin();
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
