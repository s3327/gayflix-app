import { cache } from "react";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { canManageSettings } from "@/lib/admin-roles";
import { logActivity } from "@/lib/activity-logger";

export type SiteSettingsData = {
  id: string;
  siteTitle: string;
  tagline: string;
  contactEmail: string | null;
  registrationOpen: boolean;
  maintenanceMode: boolean;
  allowedEmbedHosts: string[];
  defaultPageSize: number;
  webhookUrl: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};

export const DEFAULT_SETTINGS: SiteSettingsData = {
  id: "default",
  siteTitle: "Gayflix",
  tagline: "Stream queer cinema, series and shorts",
  contactEmail: "support@gayflix.com",
  registrationOpen: true,
  maintenanceMode: false,
  allowedEmbedHosts: [
    "vidsrc.to",
    "superembed.stream",
    "2embed.cc",
    "multiembed.mov",
    "autoembed.to",
    "player.vidsrc.me",
  ],
  defaultPageSize: 24,
  webhookUrl: null,
  updatedAt: new Date(),
  updatedBy: null,
};

/**
 * Cached per request. Retrieves database site settings with safe default fallbacks.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettingsData> => {
  try {
    const row = await db.siteSetting.findUnique({
      where: { id: "default" },
    });
    if (!row) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...row,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "test" && process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn("Using default site settings:", (err as Error)?.message || err);
    }
    return DEFAULT_SETTINGS;
  }
});

export type UpdateSiteSettingsInput = {
  siteTitle?: string;
  tagline?: string;
  contactEmail?: string | null;
  registrationOpen?: boolean;
  maintenanceMode?: boolean;
  defaultPageSize?: number;
  webhookUrl?: string | null;
  allowedEmbedHosts?: string[] | string;
};

/** Server action to update site settings. */
export async function updateSiteSettings(
  input: FormData | UpdateSiteSettingsInput
): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageSettings(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to manage site settings." };
  }

  const isForm = typeof (input as FormData)?.get === "function";
  const getField = (name: string): string | null => {
    if (!isForm) return null;
    const form = input as FormData;
    const v = form.get(name) ?? form.get(`_1_${name}`);
    return typeof v === "string" ? v : null;
  };
  const obj = !isForm ? (input as UpdateSiteSettingsInput) : {};

  const siteTitle = (isForm ? getField("siteTitle") : obj.siteTitle)?.trim() || DEFAULT_SETTINGS.siteTitle;
  const tagline = (isForm ? getField("tagline") : obj.tagline)?.trim() || DEFAULT_SETTINGS.tagline;
  const contactEmail = (isForm ? getField("contactEmail") : obj.contactEmail)?.trim() || null;

  const registrationOpen = isForm
    ? (getField("registrationOpen") === "on" || getField("registrationOpen") === "true")
    : Boolean(obj.registrationOpen ?? DEFAULT_SETTINGS.registrationOpen);

  const maintenanceMode = isForm
    ? (getField("maintenanceMode") === "on" || getField("maintenanceMode") === "true")
    : Boolean(obj.maintenanceMode ?? DEFAULT_SETTINGS.maintenanceMode);

  const defaultPageSizeVal = isForm ? getField("defaultPageSize") : obj.defaultPageSize;
  const defaultPageSize = defaultPageSizeVal ? Math.max(12, Math.min(100, Number(defaultPageSizeVal))) : 24;

  const webhookUrl = (isForm ? getField("webhookUrl") : obj.webhookUrl)?.trim() || null;

  const allowedHostsRaw = isForm
    ? (getField("allowedEmbedHosts") ?? "")
    : Array.isArray(obj.allowedEmbedHosts)
    ? obj.allowedEmbedHosts.join("\n")
    : (obj.allowedEmbedHosts ?? "");
  const allowedEmbedHosts = allowedHostsRaw
    .split(/[\n,]+/)
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0 && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));

  const saved = await db.siteSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      siteTitle,
      tagline,
      contactEmail,
      registrationOpen,
      maintenanceMode,
      allowedEmbedHosts: allowedEmbedHosts.length > 0 ? allowedEmbedHosts : DEFAULT_SETTINGS.allowedEmbedHosts,
      defaultPageSize,
      webhookUrl,
      updatedBy: session.user.email,
    },
    update: {
      siteTitle,
      tagline,
      contactEmail,
      registrationOpen,
      maintenanceMode,
      allowedEmbedHosts: allowedEmbedHosts.length > 0 ? allowedEmbedHosts : DEFAULT_SETTINGS.allowedEmbedHosts,
      defaultPageSize,
      webhookUrl,
      updatedBy: session.user.email,
    },
  });

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "setting.update",
    entityType: "setting",
    entityId: "default",
    summary: `Updated site settings (maintenance=${saved.maintenanceMode}, registration=${saved.registrationOpen})`,
    details: {
      siteTitle,
      tagline,
      registrationOpen,
      maintenanceMode,
      defaultPageSize,
      allowedEmbedHostsCount: saved.allowedEmbedHosts.length,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved successfully." };
}
