import AddToListButton from "@/components/AddToListButton";
import FavoriteButton from "@/components/FavoriteButton";
import WatchlistButton from "@/components/WatchlistButton";
import type { FavoriteEntry } from "@/lib/favorites-context";

/**
 * Favorite, Watch Later and Add to List for a movie or a series, on its
 * watch page and its episodes' pages. Side by side, wrapping on a narrow
 * phone. (The title page puts the same buttons in its header's row.)
 */
export default function TitleActions({
  media,
  className = "",
}: {
  media: FavoriteEntry;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <FavoriteButton showLabel media={media} />
      <WatchlistButton media={media} />
      <AddToListButton media={media} />
    </div>
  );
}
