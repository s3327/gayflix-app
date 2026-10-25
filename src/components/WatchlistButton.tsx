"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import LoginPrompt from "@/components/LoginPrompt";
import { useAuth } from "@/lib/auth-context";
import type { FavoriteEntry } from "@/lib/library-types";
import { useWatchlist } from "@/lib/watchlist-context";

/**
 * Watch Later, beside Favorite and Add to List: puts a title on the
 * member's Watchlist, or takes it off ("On Watchlist"). The same height
 * as the buttons beside it. A guest's tap asks them to log in or sign
 * up, and either way brings them back to this title.
 */
export default function WatchlistButton({ media }: { media: FavoriteEntry }) {
  const { isOnWatchlist, toggleWatchlist } = useWatchlist();
  const { isLoggedIn } = useAuth();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const active = isOnWatchlist(media.id);
  const Icon = active ? BookmarkCheck : Bookmark;

  return (
    <>
      <button
        type="button"
        onClick={() => (isLoggedIn ? toggleWatchlist(media) : setIsPromptOpen(true))}
        aria-pressed={active}
        className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-card border px-5 transition-colors ${
          active
            ? "border-brand-pink bg-brand-pink/10 text-ink-brand hover:bg-brand-pink/20"
            : "border-border-strong text-ink-primary hover:border-brand-pink hover:bg-bg-elevated"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        <span className="text-sm font-semibold">{active ? "On Watchlist" : "Watch Later"}</span>
      </button>

      {isPromptOpen && (
        <LoginPrompt
          title="Log in to keep a watchlist"
          description={`Your watchlist is kept in your account, on every device. Log in or sign up, and you'll come right back to ${media.title}.`}
          onClose={() => setIsPromptOpen(false)}
        />
      )}
    </>
  );
}
