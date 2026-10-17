"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AdminFlash } from "@/lib/admin-flash";
import { performUndo } from "@/lib/admin-undo-actions";

/**
 * Accessible flash banner announcing recent admin actions to screen readers
 * and providing an accessible Undo button for reversible actions (A7, F9).
 */
export default function AdminFlashBanner({ flash }: { flash: AdminFlash | null }) {
  // Dismissal is per message: a later message shows even after one was closed.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const flashId = flash ? (flash.id ?? flash.message) : null;
  const dismissed = flashId !== null && flashId === dismissedId;

  // The cookie is read once: clear it as soon as each new message shows, so
  // it doesn't come back when the panel next refreshes. The layout stays
  // mounted between pages, so this runs per message, not per mount.
  useEffect(() => {
    if (flashId !== null) {
      document.cookie = "admin_flash=; path=/admin; max-age=0";
    }
  }, [flashId]);

  if (!flash || dismissed) return null;

  async function handleUndo() {
    if (!flash?.undo || isUndoing) return;
    setIsUndoing(true);
    const undoneId = flashId;
    await performUndo(flash.undo.action, flash.undo.ids);
    setDismissedId(undoneId);
    setIsUndoing(false);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-4 border-b border-brand-pink/30 bg-brand-pink/10 px-6 py-2.5 text-xs font-semibold text-ink-primary shadow-xs"
    >
      <div className="flex items-center gap-3">
        <span>{flash.message}</span>
        {flash.undo && (
          <button
            type="button"
            disabled={isUndoing}
            onClick={handleUndo}
            className="font-bold text-brand-pink underline transition-colors hover:text-brand-pink-light disabled:opacity-60"
          >
            {isUndoing ? "Undoing…" : (flash.undo.label ?? "Undo")}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissedId(flashId)}
        aria-label="Dismiss message"
        className="flex h-5 w-5 items-center justify-center rounded-sm text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
