"use client";

import { Heart } from "lucide-react";
import { useFavorites, type FavoriteEntry } from "@/lib/favorites-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";

/**
 * Heart is always brand-pink now, not just when active — an accent
 * color on the icon itself makes it read as "the favorite control" at
 * a glance, with fill (outline vs solid) doing the job of showing
 * active/inactive state instead of color doing both jobs at once.
 *
 * `showLabel` adds "Add to Favorites"/"Remove from Favorites" text next
 * to the icon. Favorite stands alone as its own action everywhere it
 * currently appears (movie detail, series detail, basic fallback — none
 * of them sit it next to another button anymore), so every current call
 * site passes this. The prop stays optional rather than being the
 * default in case a compact/icon-only usage (a grid card, say) comes up
 * later. Same icon size/stroke weight and same button height either
 * way — only the width and the label differ.
 */
export default function FavoriteButton({
  media,
  showLabel = false,
}: {
  media: FavoriteEntry;
  showLabel?: boolean;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const active = isFavorite(media.id);

  function handleClick() {
    if (!isLoggedIn) {
      showToast("Log in to save favorites");
      return;
    }
    toggleFavorite(media);
  }

  const label = active ? "Remove from Favorites" : "Add to Favorites";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      title={label}
      className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-card border transition-colors ${
        showLabel ? "px-5" : "w-12"
      } ${
        active
          ? "border-brand-pink bg-brand-pink/10 text-ink-brand hover:bg-brand-pink/20"
          : "border-brand-pink/40 text-ink-brand hover:border-brand-pink hover:bg-brand-pink/10"
      }`}
    >
      <Heart className={`h-5 w-5 ${active ? "fill-current" : ""}`} strokeWidth={2} />
      {showLabel && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}
