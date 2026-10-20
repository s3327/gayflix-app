import AddToListButton from "@/components/AddToListButton";
import FavoriteButton from "@/components/FavoriteButton";
import type { FavoriteEntry } from "@/lib/favorites-context";

/**
 * Favorite and Add to List for a movie or a series, on its own page, its
 * watch page and its episodes' pages. Side by side, wrapping on a narrow
 * phone. `bare` leaves out their row, for a page that puts them in its
 * own row of buttons (the title page's header).
 */
export default function TitleActions({
  media,
  className = "",
  bare = false,
}: {
  media: FavoriteEntry;
  className?: string;
  bare?: boolean;
}) {
  if (bare) {
    return (
      <>
        <FavoriteButton showLabel media={media} />
        <AddToListButton media={media} />
      </>
    );
  }
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <FavoriteButton showLabel media={media} />
      <AddToListButton media={media} />
    </div>
  );
}
