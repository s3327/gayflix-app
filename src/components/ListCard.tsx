"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, Pencil, Share2, Trash2 } from "lucide-react";
import { useLists, type MediaList } from "@/lib/lists-context";
import { useToast } from "@/lib/toast-context";
import NameListModal from "@/components/NameListModal";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * List view, not a cover grid — a list is a named collection, not a
 * single piece of media, so previewing one item's poster as a stand-in
 * cover was never quite right anyway. Just a generic Layers icon, name,
 * and count per row, same divided-row treatment as SeasonTabs' episode
 * list.
 */
export default function ListCard({ list }: { list: MediaList }) {
  const { renameList, deleteList } = useLists();
  const { showToast } = useToast();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function handleShare() {
    // No backend/community layer yet, so this link only resolves to
    // anything on the same browser that created it (localStorage-backed
    // — see lists-context.tsx). Still a real, copyable link; just not
    // yet cross-device/cross-user. That's exactly the gap the (not built
    // here) community feature closes later.
    const url = `${window.location.origin}/list/${list.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
    }
    showToast("Link copied to clipboard");
  }

  return (
    <li className="flex items-center gap-4 px-4 py-3 sm:px-6">
      <Link href={`/list/${list.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-ink-muted">
          <Layers className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-semibold text-ink-primary">
            {list.name}
          </span>
          <span className="block text-xs text-ink-secondary">
            {list.items.length} {list.items.length === 1 ? "title" : "titles"}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share list"
          title="Share list"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsRenaming(true)}
          aria-label="Edit list name"
          title="Edit list name"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsConfirmingDelete(true)}
          aria-label="Delete list"
          title="Delete list"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-status-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isRenaming && (
        <NameListModal
          title="Rename List"
          initialName={list.name}
          confirmLabel="Save"
          onSubmit={(name) => renameList(list.id, name)}
          onClose={() => setIsRenaming(false)}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmModal
          title="Delete List"
          description={`Delete "${list.name}"? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteList(list.id)}
          onClose={() => setIsConfirmingDelete(false)}
        />
      )}
    </li>
  );
}
