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
  const [dismissed, setDismissed] = useState(false);
  const [prevFlash, setPrevFlash] = useState(flash);
  const [isUndoing, setIsUndoing] = useState(false);

  if (flash !== prevFlash) {
    setPrevFlash(flash);
    setDismissed(false);
  }

  // Clear cookie once loaded so refresh doesn't show old flash
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.cookie = "admin_flash=; path=/admin; max-age=0";
    }
  }, []);

  if (!flash || dismissed) return null;

  async function handleUndo() {
    if (!flash?.undo || isUndoing) return;
    setIsUndoing(true);
    await performUndo(flash.undo.action, flash.undo.ids);
    setDismissed(true);
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
        onClick={() => setDismissed(true)}
        aria-label="Dismiss message"
        className="flex h-5 w-5 items-center justify-center rounded-sm text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
