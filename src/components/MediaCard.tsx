import Image from "next/image";
import Link from "next/link";
import Badge from "@/components/Badge";
import CardQuickActions from "@/components/CardQuickActions";
import type { Media } from "@/lib/media";
import { titleHref } from "@/lib/title-href";

/**
 * Shared poster card for any "browse a list of titles" page (Trending,
 * New Releases, Genre, ...). Routes to /movie/[id] or /series/[id]
 * depending on type — a real <Link>, not a <button> like the home page's
 * PosterCard, since these pages need actual navigation.
 *
 * The only thing that varied between the two components this replaced
 * (TrendingCard's rank number, NewReleaseCard's "NEW" pill) was the
 * corner badge — so that's now just a slot, not two components.
 *
 * Play, Favorite and Add to List show over the poster on hover
 * (CardQuickActions). Pages outside the (main) layout, which has no
 * library to save to, pass `actions={false}`.
 */
export default function MediaCard({
  item,
  badge,
  actions = true,
}: {
  item: Media;
  badge?: React.ReactNode;
  actions?: boolean;
}) {
  const href = titleHref(item);
  const cardBadge =
    badge ??
    (item.category ? (
      <Badge tone="brand" size="sm">
        {item.category}
      </Badge>
    ) : null);

  return (
    <div className="group relative">
      <Link href={href} className="block">
        <div className="relative aspect-2/3 w-full overflow-hidden rounded-card bg-bg-surface transition-transform duration-200 ease-out group-hover:z-10 group-hover:scale-105">
          <Image
            src={item.posterUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 220px, (min-width: 640px) 200px, 30vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-bg-base/40 via-transparent to-transparent" />

          {cardBadge && <span className="absolute left-2 top-2 z-10">{cardBadge}</span>}
        </div>

        <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-secondary">
          {[item.year, item.duration].filter(Boolean).join(" · ")}
        </p>
      </Link>
      {actions && <CardQuickActions media={item} />}
    </div>
  );
}
