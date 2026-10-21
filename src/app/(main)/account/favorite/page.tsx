"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Heart, Plus } from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { useLists } from "@/lib/lists-context";
import { useWatchlist } from "@/lib/watchlist-context";
import FavoriteCard from "@/components/FavoriteCard";
import WatchlistCard from "@/components/WatchlistCard";
import ListCard from "@/components/ListCard";
import NameListModal from "@/components/NameListModal";
import { FilterChipButton } from "@/components/FilterChip";

type Tab = "favorites" | "watchlist" | "lists";

const TABS: { tab: Tab; label: string; subtitle: string }[] = [
  { tab: "favorites", label: "Favorites", subtitle: "Titles you've saved" },
  { tab: "watchlist", label: "Watchlist", subtitle: "Titles you mean to watch" },
  { tab: "lists", label: "My Lists", subtitle: "Titles grouped into lists" },
];

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
 * The Watchlist ("Watch later", WatchlistProvider) is a tab of its own,
 * apart from Favorites (titles they loved) in the same way.
 *
 * The tab is in the address (?tab=watchlist, ?tab=lists), so the account
 * menu's links and the Back button land on the right one.
 */
export default function AccountFavoritePage() {
  const { favorites } = useFavorites();
  const { watchlist } = useWatchlist();
  const { lists, createList } = useLists();
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get("tab");
  const activeTab: Tab = requested === "lists" || requested === "watchlist" ? requested : "favorites";
  const setActiveTab = (tab: Tab) =>
    router.replace(tab === "favorites" ? pathname : `${pathname}?tab=${tab}`, { scroll: false });
  const [isCreatingList, setIsCreatingList] = useState(false);

  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Favorite</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {TABS.find(({ tab }) => tab === activeTab)!.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(({ tab, label }) => (
            <FilterChipButton key={tab} onClick={() => setActiveTab(tab)} isActive={activeTab === tab}>
              {label}
            </FilterChipButton>
          ))}
        </div>
      </div>

      {activeTab === "watchlist" ? (
        watchlist.length > 0 ? (
          <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
            {watchlist.map((entry) => (
              <WatchlistCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
            <Bookmark className="h-8 w-8 text-ink-muted" strokeWidth={1.5} aria-hidden />
            <p className="text-sm text-ink-secondary">
              Nothing to watch later yet. Press Watch Later on a title to keep it here.
            </p>
          </div>
        )
      ) : activeTab === "favorites" ? (
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
