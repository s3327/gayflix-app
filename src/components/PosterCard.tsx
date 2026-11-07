import Image from "next/image";
import Link from "next/link";
import Badge from "@/components/Badge";
import CardQuickActions from "@/components/CardQuickActions";
import type { Media } from "@/lib/media";
import { titleHref } from "@/lib/title-href";

export default function PosterCard({ media }: { media: Media }) {
  const href = titleHref(media);

  return (
    <div className="group relative hover:z-20">
      <Link href={href} prefetch={false} className="block w-full text-left">
        {/* Hover enlarges the poster. Keyboard focus doesn't: the bigger
            poster would cover most of the focus ring. */}
        <div
          className={`relative aspect-2/3 w-full overflow-hidden rounded-card bg-linear-to-br ${media.gradient} transition-transform duration-200 ease-out group-hover:scale-105 transform-gpu will-change-transform [backface-visibility:hidden] [transform:translateZ(0)]`}
        >
          {/* gradient behind the <Image> shows briefly while it loads,
              instead of a flash of empty bg-surface */}
          <Image
            src={media.posterUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 220px, (min-width: 640px) 180px, 150px"
            className="object-cover transform-gpu [backface-visibility:hidden]"
          />
          <div className="absolute inset-0 bg-linear-to-t from-bg-base/40 via-transparent to-transparent pointer-events-none" />
          {media.category && (
            <span className="absolute left-2 top-2 z-10">
              <Badge tone="brand" size="sm">
                {media.category}
              </Badge>
            </span>
          )}
        </div>

        <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
          {media.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-secondary">
          {[media.year, media.duration].filter(Boolean).join(" · ")}
        </p>
      </Link>
      {/* Play, Favorite and Add to List, on hover */}
      <CardQuickActions media={media} />
    </div>
  );
}
