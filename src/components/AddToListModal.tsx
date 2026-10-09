"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { useLists } from "@/lib/lists-context";
import type { FavoriteEntry } from "@/lib/favorites-context";

/**
 * Opened from a Favorites card — lets someone put a favorited title into
 * one or more lists without ever leaving Favorites, and without removing
 * it from Favorites (that's a separate, unrelated toggle — see
 * FavoriteCard's own heart icon).
 */
export default function AddToListModal({
  entry,
  onClose,
}: {
  entry: FavoriteEntry;
  onClose: () => void;
}) {
  const { lists, isInList, addToList, removeFromList, createList } = useLists();
  const [newListName, setNewListName] = useState("");

  function toggleList(listId: string) {
    if (isInList(listId, entry.id)) {
      removeFromList(listId, entry.id);
    } else {
      addToList(listId, entry);
    }
  }

  function handleCreateAndAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!newListName.trim()) return;
    createList(newListName, entry);
    setNewListName("");
  }

  return (
    <Modal title="Add to List" onClose={onClose}>
      {lists.length > 0 ? (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {lists.map((list) => {
            const checked = isInList(list.id, entry.id);
            return (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => toggleList(list.id)}
                  aria-pressed={checked}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-bg-elevated"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-primary">
                    {list.name}
                    <span className="ml-1.5 text-xs text-ink-muted">
                      ({list.items.length})
                    </span>
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? "border-brand-pink bg-brand-pink text-ink-onBrand"
                        : "border-border-strong"
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">
          You don&apos;t have any lists yet — create one below.
        </p>
      )}

      <form
        onSubmit={handleCreateAndAdd}
        className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-4"
      >
        <input
          type="text"
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          placeholder="New list name"
          className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-none"
        />
        <button
          type="submit"
          aria-label="Create list"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-brand-pink text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </Modal>
  );
}
