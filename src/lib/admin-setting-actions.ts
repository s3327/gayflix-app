"use server";

import { updateSiteSettings, type UpdateSiteSettingsInput } from "@/lib/site-settings";

export async function updateSiteSettingsAction(
  formOrData: FormData | UpdateSiteSettingsInput
): Promise<{ ok: boolean; message?: string }> {
  return updateSiteSettings(formOrData);
}

export async function backfillShortFilmCategoriesAction(cutoff?: number) {
  const { backfillShortFilmCategories } = await import("@/lib/category-backfill");
  return backfillShortFilmCategories(cutoff);
}
