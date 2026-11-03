import { cache } from "react";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { canManageSettings } from "@/lib/admin-roles";
import { FORBIDDEN_SETTINGS } from "@/lib/admin-guard";
import { logActivity } from "@/lib/activity-logger";
import { isPublicHttpsUrl } from "@/lib/safe-url";

export type SiteSettingsData = {
  id: string;
  siteTitle: string;
  tagline: string;
  contactEmail: string | null;
  registrationOpen: boolean;
  maintenanceMode: boolean;
  allowedEmbedHosts: string[];
  defaultPageSize: number;
  shortFilmCutoffMinutes: number;
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
  allowedEmbedHosts: [],
  defaultPageSize: 24,
  shortFilmCutoffMinutes: 40,
  webhookUrl: null,
  updatedAt: new Date(),
  updatedBy: null,
};

/**
 * What the site runs with when its settings can't be read: closed to sign-ups
 * and in maintenance, so a database fault never opens what an admin closed.
 */
export const FAIL_SAFE_SETTINGS: SiteSettingsData = {
  ...DEFAULT_SETTINGS,
  registrationOpen: false,
  maintenanceMode: true,
};

/** The stored settings (defaults before the first save). Throws when they can't be read. */
export async function readSiteSettings(): Promise<SiteSettingsData> {
  const row = await db.siteSetting.findUnique({
    where: { id: "default" },
  });
  if (!row) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...row,
  };
}

/**
 * Cached per request. Falls back to FAIL_SAFE_SETTINGS, not the defaults,
 * when the settings can't be read.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettingsData> => {
  try {
    return await readSiteSettings();
  } catch (err) {
    if (process.env.NODE_ENV !== "test" && process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn("Site settings unavailable, failing safe:", (err as Error)?.message || err);
    }
    return FAIL_SAFE_SETTINGS;
  }
});

/**
 * Helper to check whether public registration is open.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  const settings = await getSiteSettings();
  return settings.registrationOpen;
}

export type UpdateSiteSettingsInput = {
  siteTitle?: string;
  tagline?: string;
  contactEmail?: string | null;
  registrationOpen?: boolean;
  maintenanceMode?: boolean;
  defaultPageSize?: number;
  shortFilmCutoffMinutes?: number;
  webhookUrl?: string | null;
  allowedEmbedHosts?: string[] | string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server action to update site settings with input sanitization and partial update preservation. */
export async function updateSiteSettings(
  input: FormData | UpdateSiteSettingsInput
): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageSettings(session.user.role)) {
    return { ok: false, message: FORBIDDEN_SETTINGS };
  }

  const existing = (await db.siteSetting.findUnique({ where: { id: "default" } })) ?? DEFAULT_SETTINGS;

  const isForm = typeof (input as FormData)?.get === "function";
  const rawObj: Record<string, unknown> = isForm
    ? {}
    : Array.isArray(input)
    ? (input[0] as Record<string, unknown>) || {}
    : input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};

  const getFormField = (name: string): string | null => {
    if (!isForm) return null;
    const form = input as FormData;
    for (const [k, v] of form.entries()) {
      if (typeof v === "string" && (k === name || k.endsWith(`_${name}`))) {
        return v;
      }
    }
    return null;
  };

  let siteTitle = existing.siteTitle;
  let tagline = existing.tagline;
  let contactEmail = existing.contactEmail;
  let defaultPageSize = existing.defaultPageSize;
  let shortFilmCutoffMinutes = existing.shortFilmCutoffMinutes ?? DEFAULT_SETTINGS.shortFilmCutoffMinutes;
  let webhookUrl = existing.webhookUrl;
  let maintenanceMode = existing.maintenanceMode;
  let registrationOpen = existing.registrationOpen;

  if (isForm) {
    if (getFormField("siteTitle") !== null) {
      const val = getFormField("siteTitle")!.trim().slice(0, 100);
      siteTitle = val.length > 0 ? val : existing.siteTitle;
    }
    if (getFormField("tagline") !== null) {
      tagline = getFormField("tagline")!.trim().slice(0, 250);
    }
    if (getFormField("contactEmail") !== null) {
      const val = getFormField("contactEmail")!.trim();
      if (val) {
        if (!EMAIL_REGEX.test(val)) {
          return { ok: false, message: "Invalid contact email address." };
        }
        contactEmail = val;
      } else {
        contactEmail = null;
      }
    }
    if (getFormField("defaultPageSize") !== null) {
      const parsed = Number(getFormField("defaultPageSize"));
      defaultPageSize = Number.isFinite(parsed)
        ? Math.max(12, Math.min(100, Math.floor(parsed)))
        : existing.defaultPageSize;
    }
    if (getFormField("shortFilmCutoffMinutes") !== null) {
      const parsed = Number(getFormField("shortFilmCutoffMinutes"));
      shortFilmCutoffMinutes = Number.isFinite(parsed)
        ? Math.max(1, Math.min(300, Math.floor(parsed)))
        : existing.shortFilmCutoffMinutes;
    }
    if (getFormField("webhookUrl") !== null) {
      const val = getFormField("webhookUrl")!.trim();
      if (val) {
        if (!isPublicHttpsUrl(val)) {
          return { ok: false, message: "Webhook URL must be a valid public HTTPS URL." };
        }
        webhookUrl = val;
      } else {
        webhookUrl = null;
      }
    }

    const hasAccessTab = getFormField("maintenanceMode") !== null || getFormField("registrationOpen") !== null;
    if (hasAccessTab) {
      maintenanceMode =
        getFormField("maintenanceMode") === "on" ||
        getFormField("maintenanceMode") === "true" ||
        getFormField("maintenanceMode") === "1";
      registrationOpen =
        getFormField("registrationOpen") === "on" ||
        getFormField("registrationOpen") === "true" ||
        getFormField("registrationOpen") === "1";
    }
  } else {
    if (rawObj.siteTitle !== undefined) {
      const val = String(rawObj.siteTitle).trim().slice(0, 100);
      siteTitle = val.length > 0 ? val : existing.siteTitle;
    }
    if (rawObj.tagline !== undefined) {
      tagline = String(rawObj.tagline).trim().slice(0, 250);
    }
    if (rawObj.contactEmail !== undefined) {
      const val = rawObj.contactEmail ? String(rawObj.contactEmail).trim() : null;
      if (val) {
        if (!EMAIL_REGEX.test(val)) {
          return { ok: false, message: "Invalid contact email address." };
        }
        contactEmail = val;
      } else {
        contactEmail = null;
      }
    }
    if (rawObj.defaultPageSize !== undefined) {
      const parsed = Number(rawObj.defaultPageSize);
      defaultPageSize = Number.isFinite(parsed)
        ? Math.max(12, Math.min(100, Math.floor(parsed)))
        : existing.defaultPageSize;
    }
    if (rawObj.shortFilmCutoffMinutes !== undefined) {
      const parsed = Number(rawObj.shortFilmCutoffMinutes);
      shortFilmCutoffMinutes = Number.isFinite(parsed)
        ? Math.max(1, Math.min(300, Math.floor(parsed)))
        : existing.shortFilmCutoffMinutes;
    }
    if (rawObj.webhookUrl !== undefined) {
      const val = rawObj.webhookUrl ? String(rawObj.webhookUrl).trim() : null;
      if (val) {
        if (!isPublicHttpsUrl(val)) {
          return { ok: false, message: "Webhook URL must be a valid public HTTPS URL." };
        }
        webhookUrl = val;
      } else {
        webhookUrl = null;
      }
    }
    if (rawObj.maintenanceMode !== undefined) {
      maintenanceMode =
        typeof rawObj.maintenanceMode === "boolean"
          ? rawObj.maintenanceMode
          : rawObj.maintenanceMode === "true" || rawObj.maintenanceMode === "on" || rawObj.maintenanceMode === "1";
    }
    if (rawObj.registrationOpen !== undefined) {
      registrationOpen =
        typeof rawObj.registrationOpen === "boolean"
          ? rawObj.registrationOpen
          : rawObj.registrationOpen === "true" || rawObj.registrationOpen === "on" || rawObj.registrationOpen === "1";
    }
  }

  const saved = await db.siteSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      siteTitle,
      tagline,
      contactEmail,
      registrationOpen,
      maintenanceMode,
      allowedEmbedHosts: existing.allowedEmbedHosts ?? [],
      defaultPageSize,
      shortFilmCutoffMinutes,
      webhookUrl,
      updatedBy: session.user.email,
    },
    update: {
      siteTitle,
      tagline,
      contactEmail,
      registrationOpen,
      maintenanceMode,
      allowedEmbedHosts: existing.allowedEmbedHosts ?? [],
      defaultPageSize,
      shortFilmCutoffMinutes,
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
      shortFilmCutoffMinutes,
    },
  });

  revalidatePath("/", "page");
  revalidatePath("/", "layout");
  revalidatePath("/(main)", "layout");
  revalidatePath("/maintenance", "page");
  return { ok: true, message: "Settings saved successfully." };
}
