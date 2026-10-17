"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, Plus } from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { useLists } from "@/lib/lists-context";
import FavoriteCard from "@/components/FavoriteCard";
import ListCard from "@/components/ListCard";
import NameListModal from "@/components/NameListModal";
import { FilterChipButton } from "@/components/FilterChip";

type Tab = "favorites" | "lists";

/**
 * Reads from FavoritesProvider and ListsProvider, both set up in
 * (main)/layout.tsx — so titles favorited/grouped from anywhere in the
 * signed-in app show up here immediately, no separate fetch/sync
 * needed. Both are saved to the user's account.
 *
 * Favorites and Lists are deliberately independent: adding a title to a
 * list does not remove it from Favorites, and removing a title from
 * Favorites does not remove it from any list it's already in (a list
 * holds its own snapshot — see lists-context.tsx).
 *
 * The tab is in the address (?tab=lists), so the account menu's My
 * Lists link and the Back button land on the right one.
 */
export default function AccountFavoritePage() {
  const { favorites } = useFavorites();
  const { lists, createList } = useLists();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab: Tab = useSearchParams().get("tab") === "lists" ? "lists" : "favorites";
  const setActiveTab = (tab: Tab) =>
    router.replace(tab === "lists" ? `${pathname}?tab=lists` : pathname, { scroll: false });
  const [isCreatingList, setIsCreatingList] = useState(false);

  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Favorite</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {activeTab === "favorites" ? "Titles you've saved" : "Titles grouped into lists"}
          </p>
        </div>

        <div className="flex gap-2">
          <FilterChipButton
            onClick={() => setActiveTab("favorites")}
            isActive={activeTab === "favorites"}
          >
            Favorites
          </FilterChipButton>
          <FilterChipButton
            onClick={() => setActiveTab("lists")}
            isActive={activeTab === "lists"}
          >
            My Lists
          </FilterChipButton>
        </div>
      </div>

      {activeTab === "favorites" ? (
        favorites.length > 0 ? (
          <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
            {favorites.map((entry) => (
              <FavoriteCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
            <Heart className="h-8 w-8 text-ink-muted" strokeWidth={1.5} />
            <p className="text-sm text-ink-secondary">
              Nothing saved yet — favorite a title to see it here.
            </p>
          </div>
        )
      ) : (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setIsCreatingList(true)}
            className="flex items-center gap-2 rounded-card bg-brand-pink px-5 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            <Plus className="h-4 w-4" />
            Create List
          </button>

          {lists.length > 0 ? (
            <ul className="mt-6 flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-bg-surface">
              {lists.map((list) => (
                <ListCard key={list.id} list={list} />
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-sm text-ink-secondary">
              No lists yet — group your favorites into one to get started.
            </p>
          )}
        </div>
      )}

      {isCreatingList && (
        <NameListModal
          title="Create List"
          confirmLabel="Create"
          onSubmit={(name) => createList(name)}
          onClose={() => setIsCreatingList(false)}
        />
      )}
    </div>
  );
}
