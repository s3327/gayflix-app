import AddToListButton from "@/components/AddToListButton";
import FavoriteButton from "@/components/FavoriteButton";
import RatingButtons from "@/components/RatingButtons";
import WatchlistButton from "@/components/WatchlistButton";
import type { FavoriteEntry } from "@/lib/favorites-context";

/**
 * Favorite, Watch Later and Add to List for a movie or a series, on its
 * watch page and its episodes' pages. Side by side, wrapping on a narrow
 * phone, with the rating buttons below. (The title page puts the same
 * buttons in its header.)
 */
export default function TitleActions({
  media,
  className = "",
}: {
  media: FavoriteEntry;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <FavoriteButton showLabel media={media} />
        <WatchlistButton media={media} />
        <AddToListButton media={media} />
      </div>
      <RatingButtons mediaId={media.id} title={media.title} className="mt-3" />
    </div>
  );
}
