import Image from "next/image";
import Link from "next/link";
import { Play, X } from "lucide-react";
import CardIconButton from "@/components/CardIconButton";
import type { RecentlyWatched } from "@/lib/media";
import { progressFraction, timeLeft } from "@/lib/watch-progress";

/**
 * A title on Continue Watching. It opens the player again: a movie's,
 * or the episode of a series played last, which picks up where it
 * stopped. Once an episode was watched to the end it's the next one
 * instead. A bar shows how far in it got, when the player could tell
 * (a file or a stream, not an embed).
 */
export default function ContinueWatchingCard({
  item,
  onRemove,
}: {
  item: RecentlyWatched;
  onRemove: () => void;
}) {
  const { episode, progress } = item;
  const left = progress && timeLeft(progress);
  const episodeName = episode
    ? `season ${episode.seasonNumber}, episode ${episode.episodeNumber}: ${episode.title}`
    : undefined;
  const label = episode?.isNext
    ? `Play ${item.title}, next: ${episodeName}`
    : [`Resume ${item.title}`, episodeName, left].filter(Boolean).join(", ");

  return (
    <div className="relative">
      <Link
        href={episode ? `/episode/${episode.id}` : `/watch/${item.id}`}
        prefetch={false}
        className="group/card block w-full text-left"
        aria-label={label}
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
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-base/70 backdrop-blur-sm">
              <Play className="h-5 w-5 fill-ink-primary text-ink-primary" />
            </span>
          </div>

          {progress && (
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-ink-primary/25">
              <div
                className="h-full bg-brand-pink"
                style={{ width: `${Math.max(progressFraction(progress) * 100, 2)}%` }}
              />
            </div>
          )}
        </div>

        <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {episode
            ? `${episode.isNext ? "Next: " : ""}S${episode.seasonNumber} · E${episode.episodeNumber} · ${episode.title}`
            : [item.year, left ?? item.duration].filter(Boolean).join(" · ")}
        </p>
      </Link>

      <CardIconButton icon={X} onClick={onRemove} label="Remove from Continue Watching" />
    </div>
  );
}
