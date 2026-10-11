import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import type { RecentlyWatched } from "@/lib/media";

/**
 * A title on Continue Watching. It opens the player again: a movie's,
 * or the episode of a series played last. The player doesn't report
 * progress yet, so there's no progress bar.
 */
export default function ContinueWatchingCard({ item }: { item: RecentlyWatched }) {
  const { episode } = item;

  return (
    <Link
      href={episode ? `/episode/${episode.id}` : `/watch/${item.id}`}
      className="group block w-full text-left"
      aria-label={
        episode
          ? `Resume ${item.title}, season ${episode.seasonNumber}, episode ${episode.episodeNumber}: ${episode.title}`
          : `Resume ${item.title}`
      }
    >
      <div
        className={`relative aspect-video w-full overflow-hidden rounded-card bg-bg-surface bg-linear-to-br ${item.gradient ?? ""}`}
      >
        <Image
          src={item.backdropUrl ?? item.posterUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 260px, (min-width: 640px) 220px, 45vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-bg-base/70 via-transparent to-transparent" />

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-base/70 backdrop-blur-sm">
            <Play className="h-5 w-5 fill-ink-primary text-ink-primary" />
          </span>
        </div>
      </div>

      <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
        {item.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-muted">
        {episode
          ? `S${episode.seasonNumber} · E${episode.episodeNumber} · ${episode.title}`
          : [item.year, item.duration].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}
