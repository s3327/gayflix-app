import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import type { ContinueWatchingItem } from "@/lib/mock-continue-watching";

export default function ContinueWatchingCard({
  item,
}: {
  item: ContinueWatchingItem;
}) {
  return (
    <Link
      href={`/watch/${item.id}`}
      className="group block w-full text-left"
      aria-label={`Resume ${item.name}${item.episodeLabel ? `, ${item.episodeLabel}` : ""}`}
    >
      <div
        className={`relative aspect-video w-full overflow-hidden rounded-card bg-linear-to-br ${item.gradient}`}
      >
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes="(min-width: 1024px) 260px, (min-width: 640px) 220px, 45vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-bg-base/70 via-transparent to-transparent" />

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-base/70 backdrop-blur-sm">
            <Play className="h-5 w-5 fill-ink-primary text-ink-primary" />
          </span>
        </div>

        {/* Progress bar */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-bg-base/60">
          <div
            className="h-full bg-brand-pink"
            style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }}
          />
        </div>
      </div>

      <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
        {item.name}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-muted">
        {item.episodeLabel ? `${item.episodeLabel} · ` : ""}
        {item.remaining}
      </p>
    </Link>
  );
}
