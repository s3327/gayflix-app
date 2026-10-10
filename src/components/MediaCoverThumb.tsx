import Image from "next/image";

type CoverEntry = {
  title: string;
  posterUrl?: string;
  gradient?: string;
};

/**
 * The "aspect-2/3 box, real poster if there is one, else a gradient
 * fallback, plus a dark gradient overlay on top" block — shared by
 * FavoriteCard, HistoryCard, ListCard's cover, and /list/[id]'s item
 * grid, all of which used to reimplement this identically. The
 * gradient fallback exists because the 4 rich mock-movie-details.ts
 * records have no posterUrl at all (gradient-block only).
 *
 * Expects a `group` class on an ancestor if hover-scale is wanted —
 * this only renders the box itself, not the interactive wrapper
 * (Link/button), since that varies by caller.
 */
export default function MediaCoverThumb({
  entry,
  sizes = "(min-width: 1024px) 220px, (min-width: 640px) 200px, 30vw",
}: {
  entry: CoverEntry;
  sizes?: string;
}) {
  return (
    <div
      className={`relative aspect-2/3 w-full overflow-hidden rounded-card bg-bg-elevated transition-transform duration-200 ease-out group-hover:scale-105 ${
        !entry.posterUrl && entry.gradient ? `bg-linear-to-br ${entry.gradient}` : ""
      }`}
    >
      {entry.posterUrl && (
        <Image
          src={entry.posterUrl}
          alt={entry.title}
          fill
          sizes={sizes}
          className="object-cover"
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-bg-base/40 via-transparent to-transparent" />
    </div>
  );
}
