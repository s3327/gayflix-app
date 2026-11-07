"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Heart, ListChecks, ListPlus, Play } from "lucide-react";
import AddToListModal from "@/components/AddToListModal";
import LoginPrompt from "@/components/LoginPrompt";
import { useAuth } from "@/lib/auth-context";
import { useFavorites, type FavoriteEntry } from "@/lib/favorites-context";
import { useLists } from "@/lib/lists-context";
import { useWatchlist } from "@/lib/watchlist-context";
import type { Media } from "@/lib/media";

const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-base/80 backdrop-blur-sm transition-colors hover:bg-bg-base";

/**
 * Play, Favorite, Watch Later and Add to List over a poster card (MediaCard,
 * PosterCard), for browsing without opening each title. They're a
 * shortcut for the mouse: they show on hover, and only where there's a
 * mouse or a trackpad. A tap on a touchscreen, the keyboard and screen
 * readers open the title instead, whose page has the same actions, so
 * a grid stays one stop per title. Play on a series starts its first
 * episode (/watch/[id] sends it on).
 *
 * The parent card is `relative group`, with its poster at the top; this
 * sits over the poster and grows with it on hover. It needs the library
 * providers, so pages outside the (main) layout leave it out.
 */
export default function CardQuickActions({ media }: { media: Media }) {
  const { isLoggedIn } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isOnWatchlist, toggleWatchlist } = useWatchlist();
  const { lists, isInList } = useLists();
  const [open, setOpen] = useState<
    "lists" | "login-favorites" | "login-watchlist" | "login-lists" | null
  >(null);

  const entry: FavoriteEntry = {
    id: media.id,
    title: media.title,
    year: media.year,
    duration: media.duration,
    type: media.type,
    genre: media.genre,
    posterUrl: media.posterUrl,
    gradient: media.gradient,
  };
  const favorite = isFavorite(media.id);
  const onWatchlist = isOnWatchlist(media.id);
  const WatchlistIcon = onWatchlist ? BookmarkCheck : Bookmark;
  const inAList = lists.some((list) => isInList(list.id, media.id));
  const ListIcon = inAList ? ListChecks : ListPlus;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden aspect-2/3 opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:scale-105 group-hover:opacity-100 transform-gpu will-change-transform [backface-visibility:hidden] [transform:translateZ(0)] [@media(hover:hover)]:block"
      >
        <div className="pointer-events-auto absolute inset-x-2 bottom-2 flex items-center gap-1.5">
          <Link
            href={`/watch/${media.id}`}
            tabIndex={-1}
            aria-label={`Play ${media.title}`}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-pill bg-brand-pink px-3 text-xs font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light"
          >
            <Play className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden />
            Play
          </Link>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => (isLoggedIn ? toggleFavorite(entry) : setOpen("login-favorites"))}
            aria-label={`Favorite ${media.title}`}
            aria-pressed={favorite}
            title={favorite ? "Remove from Favorites" : "Add to Favorites"}
            className={`${ICON_BUTTON} text-ink-brand`}
          >
            <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => (isLoggedIn ? toggleWatchlist(entry) : setOpen("login-watchlist"))}
            aria-label={`Watch ${media.title} later`}
            aria-pressed={onWatchlist}
            title={onWatchlist ? "On Watchlist" : "Watch Later"}
            className={`${ICON_BUTTON} ${onWatchlist ? "text-ink-brand" : "text-ink-primary"}`}
          >
            <WatchlistIcon className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setOpen(isLoggedIn ? "lists" : "login-lists")}
            aria-label={`Add ${media.title} to a list`}
            aria-haspopup="dialog"
            title={inAList ? "In a list" : "Add to List"}
            className={`${ICON_BUTTON} text-ink-primary`}
          >
            <ListIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {open === "lists" && <AddToListModal entry={entry} onClose={() => setOpen(null)} />}
      {open === "login-favorites" && (
        <LoginPrompt
          title="Log in to save favorites"
          description={`Favorites are kept in your account, on every device. Log in or sign up, and you'll come right back here.`}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "login-watchlist" && (
        <LoginPrompt
          title="Log in to keep a watchlist"
          description={`Your watchlist is kept in your account, on every device. Log in or sign up, and you'll come right back here.`}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "login-lists" && (
        <LoginPrompt
          title="Log in to make lists"
          description={`Lists are kept in your account, on every device. Log in or sign up, and you'll come right back here.`}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
