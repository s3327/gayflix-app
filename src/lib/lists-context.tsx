"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SAVE_FAILED } from "@/lib/favorites-context";
import * as library from "@/lib/library-actions";
import { cleanListName, type FavoriteEntry, type MediaList } from "@/lib/library-types";
import { useToast } from "@/lib/toast-context";

export type { MediaList } from "@/lib/library-types";

type ListsContextValue = {
  lists: MediaList[];
  getList: (id: string) => MediaList | undefined;
  createList: (name: string, firstItem?: FavoriteEntry) => MediaList | undefined;
  deleteList: (id: string) => void;
  renameList: (id: string, name: string) => void;
  setListPublic: (id: string, isPublic: boolean) => void;
  addToList: (listId: string, entry: FavoriteEntry) => void;
  removeFromList: (listId: string, itemId: string) => void;
  isInList: (listId: string, itemId: string) => boolean;
};

const ListsContext = createContext<ListsContextValue | null>(null);

type ListsRecord = Record<string, MediaList>;

/**
 * The signed-in user's lists, stored in their account (see
 * src/lib/library-actions.ts). A list is private until its owner shares
 * it; then anyone with the link can view it at /list/[id]. Only the
 * owner can change it. Changes show immediately and
 * are undone, with a toast, if the server rejects them.
 *
 * List ids are random UUIDs made here, so a new list can be used (and
 * shared) before the server has answered.
 */
export function ListsProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial?: ListsRecord;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [lists, setLists] = useState<ListsRecord>(initial ?? {});

  // Runs an optimistic change, then the server call; on failure, puts
  // the affected list back the way it was.
  const commit = useCallback(
    (listId: string, change: (prev: ListsRecord) => ListsRecord, save: () => Promise<void>) => {
      const before = lists[listId];
      setLists(change);
      save().catch(() => {
        setLists((prev) => {
          const next = { ...prev };
          if (before) next[listId] = before;
          else delete next[listId];
          return next;
        });
        showToast(SAVE_FAILED, { type: "error" });
      });
    },
    [lists, showToast]
  );

  const getList = useCallback((id: string) => lists[id], [lists]);

  const isInList = useCallback(
    (listId: string, itemId: string) =>
      Boolean(lists[listId]?.items.some((item) => item.id === itemId)),
    [lists]
  );

  const createList = useCallback(
    (name: string, firstItem?: FavoriteEntry) => {
      if (!userId) {
        showToast("Log in to make lists", { type: "info" });
        return undefined;
      }
      const newList: MediaList = {
        id: crypto.randomUUID(),
        name: cleanListName(name),
        isPublic: false,
        createdAt: new Date().toISOString(),
        items: firstItem ? [firstItem] : [],
      };
      commit(
        newList.id,
        (prev) => ({ ...prev, [newList.id]: newList }),
        () => library.createList(newList.id, newList.name, firstItem)
      );
      showToast(`List "${newList.name}" created`);
      return newList;
    },
    [commit, showToast, userId]
  );

  const deleteList = useCallback(
    (id: string) => {
      // Toast from outside the updater — updaters must stay pure (React
      // may run them twice in development).
      const name = lists[id]?.name;
      commit(
        id,
        (prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        },
        () => library.deleteList(id)
      );
      if (name) showToast(`Deleted "${name}"`);
    },
    [commit, lists, showToast]
  );

  const renameList = useCallback(
    (id: string, name: string) => {
      if (!name.trim()) return;
      const cleaned = cleanListName(name);
      commit(
        id,
        (prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], name: cleaned } } : prev),
        () => library.renameList(id, cleaned)
      );
      showToast("List renamed");
    },
    [commit, showToast]
  );

  const setListPublic = useCallback(
    (id: string, isPublic: boolean) => {
      commit(
        id,
        (prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], isPublic } } : prev),
        () => library.setListPublic(id, isPublic)
      );
    },
    [commit]
  );

  const addToList = useCallback(
    (listId: string, entry: FavoriteEntry) => {
      const list = lists[listId];
      if (!list) return;
      if (list.items.some((item) => item.id === entry.id)) {
        showToast(`Already in "${list.name}"`, { type: "info" });
        return;
      }
      commit(
        listId,
        (prev) => {
          const existing = prev[listId];
          if (!existing || existing.items.some((item) => item.id === entry.id)) return prev;
          return { ...prev, [listId]: { ...existing, items: [...existing.items, entry] } };
        },
        () => library.addToList(listId, entry)
      );
      showToast(`Added to "${list.name}"`);
    },
    [commit, lists, showToast]
  );

  const removeFromList = useCallback(
    (listId: string, itemId: string) => {
      const listName = lists[listId]?.name ?? "list";
      commit(
        listId,
        (prev) => {
          const existing = prev[listId];
          if (!existing) return prev;
          return {
            ...prev,
            [listId]: { ...existing, items: existing.items.filter((item) => item.id !== itemId) },
          };
        },
        () => library.removeFromList(listId, itemId)
      );
      showToast(`Removed from "${listName}"`);
    },
    [commit, lists, showToast]
  );

  const value = useMemo<ListsContextValue>(
    () => ({
      lists: Object.values(lists),
      getList,
      createList,
      deleteList,
      renameList,
      setListPublic,
      addToList,
      removeFromList,
      isInList,
    }),
    [
      lists,
      getList,
      createList,
      deleteList,
      renameList,
      setListPublic,
      addToList,
      removeFromList,
      isInList,
    ]
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useLists() {
  const context = useContext(ListsContext);
  if (!context) {
    throw new Error("useLists must be used within a ListsProvider");
  }
  return context;
}

/** Copies a list's link, which works for anyone once the list is shared. */
export async function copyListLink(
  listId: string,
  showToast: ReturnType<typeof useToast>["showToast"]
) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/list/${listId}`);
    showToast("Link copied to clipboard");
  } catch {
    showToast("Couldn't copy the link. Open the list and copy it from the address bar.", {
      type: "error",
    });
  }
}
