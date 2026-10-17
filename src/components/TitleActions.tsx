import AddToListButton from "@/components/AddToListButton";
import FavoriteButton from "@/components/FavoriteButton";
import type { FavoriteEntry } from "@/lib/favorites-context";

/**
 * Favorite and Add to List for a movie or a series, on its own page, its
 * watch page and its episodes' pages. Side by side, wrapping on a narrow
 * phone.
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
      <AddToListButton media={media} />
    </div>
  );
}
