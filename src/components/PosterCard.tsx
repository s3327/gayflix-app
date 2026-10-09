import Image from "next/image";
import Link from "next/link";
import type { Media } from "@/lib/media";

export default function PosterCard({ media }: { media: Media }) {
  const href = media.type === "movie" ? `/movie/${media.id}` : `/series/${media.id}`;

  return (
    <Link href={href} className="group block w-full text-left">
      <div
        className={`relative aspect-[2/3] w-full overflow-hidden rounded-card bg-gradient-to-br ${media.gradient} transition-transform duration-200 ease-out group-hover:z-10 group-hover:scale-105 group-focus-visible:z-10 group-focus-visible:scale-105`}
      >
        {/* gradient behind the <Image> shows briefly while it loads,
            instead of a flash of empty bg-surface */}
        <Image
          src={media.posterUrl}
          alt={media.title}
          fill
          sizes="(min-width: 1024px) 220px, (min-width: 640px) 180px, 150px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-base/40 via-transparent to-transparent" />
      </div>

      <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
        {media.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-secondary">
        {media.year} · {media.duration}
      </p>
    </Link>
  );
}
