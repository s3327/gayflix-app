"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { FavoriteEntry } from "@/lib/favorites-context";
import { useToast } from "@/lib/toast-context";
import { usePersistedRecord } from "@/lib/use-persisted-record";

const STORAGE_KEY = "gayflix:lists";

export type MediaList = {
  id: string;
  name: string;
  createdAt: string;
  /**
   * Snapshot copies, not just ids — a list is meant to hold onto a title
   * even if it's later unfavorited (that's normal "watchlist" behavior:
   * removing something from Favorites shouldn't silently empty every
   * list it was ever added to). Deduped by id.
   */
  items: FavoriteEntry[];
};

type ListsContextValue = {
  lists: MediaList[];
  getList: (id: string) => MediaList | undefined;
  createList: (name: string, firstItem?: FavoriteEntry) => MediaList;
  deleteList: (id: string) => void;
  renameList: (id: string, name: string) => void;
  addToList: (listId: string, entry: FavoriteEntry) => void;
  removeFromList: (listId: string, itemId: string) => void;
  isInList: (listId: string, itemId: string) => boolean;
};

const ListsContext = createContext<ListsContextValue | null>(null);

function makeListId() {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * No backend yet, so this is localStorage (via usePersistedRecord)
 * rather than a real API — same status as favorites-context.tsx.
 *
 * This is also the foundation the (not-yet-built) community features
 * will sit on: share/explore/like/copy-to-my-list all need a `MediaList`
 * to point at, which is exactly what this provider already produces —
 * they're just not wired to anything beyond this browser yet.
 */
export function ListsProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [lists, setLists] = usePersistedRecord<MediaList>(STORAGE_KEY);

  const getList = useCallback((id: string) => lists[id], [lists]);

  const isInList = useCallback(
    (listId: string, itemId: string) =>
      Boolean(lists[listId]?.items.some((item) => item.id === itemId)),
    [lists]
  );

  const createList = useCallback(
    (name: string, firstItem?: FavoriteEntry) => {
      const trimmed = name.trim() || "Untitled List";
      const newList: MediaList = {
        id: makeListId(),
        name: trimmed,
        createdAt: new Date().toISOString(),
        items: firstItem ? [firstItem] : [],
      };
      setLists((prev) => ({ ...prev, [newList.id]: newList }));
      showToast(`List "${trimmed}" created`);
      return newList;
    },
    [setLists, showToast]
  );

  const deleteList = useCallback(
    (id: string) => {
      setLists((prev) => {
        const name = prev[id]?.name;
        const next = { ...prev };
        delete next[id];
        if (name) showToast(`Deleted "${name}"`);
        return next;
      });
    },
    [setLists, showToast]
  );

  const renameList = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setLists((prev) => {
        const existing = prev[id];
        if (!existing) return prev;
        return { ...prev, [id]: { ...existing, name: trimmed } };
      });
      showToast("List renamed");
    },
    [setLists, showToast]
  );

  const addToList = useCallback(
    (listId: string, entry: FavoriteEntry) => {
      setLists((prev) => {
        const existing = prev[listId];
        if (!existing) return prev;
        if (existing.items.some((item) => item.id === entry.id)) return prev;
        return {
          ...prev,
          [listId]: { ...existing, items: [...existing.items, entry] },
        };
      });
      const listName = lists[listId]?.name ?? "list";
      showToast(`Added to "${listName}"`);
    },
    [lists, setLists, showToast]
  );

  const removeFromList = useCallback(
    (listId: string, itemId: string) => {
      setLists((prev) => {
        const existing = prev[listId];
        if (!existing) return prev;
        return {
          ...prev,
          [listId]: {
            ...existing,
            items: existing.items.filter((item) => item.id !== itemId),
          },
        };
      });
      const listName = lists[listId]?.name ?? "list";
      showToast(`Removed from "${listName}"`);
    },
    [lists, setLists, showToast]
  );

  const value = useMemo<ListsContextValue>(
    () => ({
      lists: Object.values(lists),
      getList,
      createList,
      deleteList,
      renameList,
      addToList,
      removeFromList,
      isInList,
    }),
    [lists, getList, createList, deleteList, renameList, addToList, removeFromList, isInList]
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
