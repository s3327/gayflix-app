"use client";

import { useId } from "react";
import { Link2, Lock } from "lucide-react";
import Modal from "@/components/Modal";
import { copyListLink, useLists, type MediaList } from "@/lib/lists-context";
import { useToast } from "@/lib/toast-context";

/**
 * The owner's Share dialog for one list (from My Lists and the list's
 * own page). Lists start private; the switch shares it with anyone who
 * has the link, and turning it off makes the link stop working.
 */
export default function ShareListModal({
  list: saved,
  onClose,
}: {
  list: MediaList;
  onClose: () => void;
}) {
  const { getList, setListPublic } = useLists();
  const { showToast } = useToast();
  // The live copy, so the switch follows a change at once.
  const list = getList(saved.id) ?? saved;
  const id = useId();

  return (
    <Modal title={`Share "${list.name}"`} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={`${id}-label`} className="text-sm font-semibold text-ink-primary">
            Anyone with the link can view
          </p>
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-secondary">
            {list.isPublic
              ? "They see the list's name and titles, never your name or email."
              : "Only you can see this list now."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={list.isPublic}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          onClick={() => setListPublic(list.id, !list.isPublic)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
            list.isPublic ? "bg-brand-pink" : "bg-border-strong"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-ink-primary transition-transform ${
              list.isPublic ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      <div className="mt-6 border-t border-border-subtle pt-4">
        {list.isPublic ? (
          <button
            type="button"
            onClick={() => copyListLink(list.id, showToast)}
            className="flex items-center gap-2 rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            Copy Link
          </button>
        ) : (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            Turn on sharing to get a link.
          </p>
        )}
      </div>
    </Modal>
  );
}
