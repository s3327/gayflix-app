"use server";

import { updateSiteSettings } from "@/lib/site-settings";

export async function updateSiteSettingsAction(form: FormData): Promise<{ ok: boolean; message?: string }> {
  return updateSiteSettings(form);
}
