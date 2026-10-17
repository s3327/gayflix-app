"use server";

import { updateSiteSettings, type UpdateSiteSettingsInput } from "@/lib/site-settings";

export async function updateSiteSettingsAction(
  formOrData: FormData | UpdateSiteSettingsInput
): Promise<{ ok: boolean; message?: string }> {
  return updateSiteSettings(formOrData);
}
