import { cookies } from "next/headers";

export type AdminFlashUndo = {
  label?: string;
  action:
    | "restore_media"
    | "trash_media"
    | "publish_media"
    | "unpublish_media"
    | "resolve_report"
    | "reopen_report";
  ids: string[];
};

export type AdminFlash = {
  message: string;
  undo?: AdminFlashUndo;
  /** Set by setAdminFlash, so the banner can tell a new message from one it already showed. */
  id?: string;
};

const FLASH_COOKIE = "admin_flash";

/**
 * Sets a flash notification message (with optional undo action) in a cookie
 * to be displayed in the admin panel on the next render (A7, F9).
 */
export async function setAdminFlash(flash: AdminFlash): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(FLASH_COOKIE, JSON.stringify({ ...flash, id: crypto.randomUUID() }), {
    path: "/admin",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60,
  });
}

/**
 * Reads the pending flash notification from the cookie, if present.
 */
export async function getAdminFlash(): Promise<AdminFlash | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.message === "string") {
      return parsed as AdminFlash;
    }
  } catch {
    // Malformed JSON
  }
  return null;
}

