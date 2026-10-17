"use server";

import { revalidatePath } from "next/cache";
import { setAdminFlash, type AdminFlashUndo } from "@/lib/admin-flash";
import { restoreTitle, updateMediaStatusBatch } from "@/lib/admin-catalog-actions";
import { reopenReport, resolveReport } from "@/lib/admin-report-actions";
import { requireAdmin } from "@/lib/session";
import { canManageCatalog, canManageUsers } from "@/lib/admin-roles";
import { FORBIDDEN_CATALOG, FORBIDDEN_USERS } from "@/lib/admin-guard";

const UNDO_ACTIONS: AdminFlashUndo["action"][] = [
  "restore_media",
  "publish_media",
  "unpublish_media",
  "resolve_report",
  "reopen_report",
];

/**
 * Server action to execute reversible admin actions triggered from the Undo banner (A7).
 */
export async function performUndo(actionArg: unknown, idsArg: unknown): Promise<void> {
  const session = await requireAdmin();
  const action = UNDO_ACTIONS.find((known) => known === actionArg);
  // Undo covers what one library page can check (100 rows).
  const ids = Array.isArray(idsArg)
    ? [...new Set(idsArg.filter((id): id is string => typeof id === "string" && id.length <= 200))].slice(0, 100)
    : [];
  if (!action || ids.length === 0) return;

  switch (action) {
    case "restore_media":
    case "publish_media":
    case "unpublish_media": {
      if (!canManageCatalog(session.user.role)) {
        await setAdminFlash({ message: FORBIDDEN_CATALOG });
        return;
      }
      break;
    }
    case "resolve_report":
    case "reopen_report": {
      if (!canManageUsers(session.user.role)) {
        await setAdminFlash({ message: FORBIDDEN_USERS });
        return;
      }
      break;
    }
  }

  switch (action) {
    case "restore_media": {
      for (const id of ids) {
        await restoreTitle(id);
      }
      await setAdminFlash({
        message: `${ids.length === 1 ? "Title" : `${ids.length} titles`} restored.`,
      });
      break;
    }
    case "publish_media": {
      await updateMediaStatusBatch(ids, "published");
      await setAdminFlash({
        message: `${ids.length === 1 ? "Title" : `${ids.length} titles`} published.`,
      });
      break;
    }
    case "unpublish_media": {
      await updateMediaStatusBatch(ids, "draft");
      await setAdminFlash({
        message: `${ids.length === 1 ? "Title" : `${ids.length} titles`} unpublished.`,
      });
      break;
    }
    case "resolve_report": {
      for (const id of ids) {
        await resolveReport(id);
      }
      await setAdminFlash({ message: "Report resolved." });
      break;
    }
    case "reopen_report": {
      for (const id of ids) {
        await reopenReport(id);
      }
      await setAdminFlash({ message: "Report reopened." });
      break;
    }
  }

  revalidatePath("/admin", "layout");
}

