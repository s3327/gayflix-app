"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import type { Episode } from "@/lib/media";
import { useSeriesProgress } from "@/lib/use-series-progress";

/**
 * A series page's main action: "Start Watching" opens the first episode
 * until the viewer has played one, then "Continue S1 E3" goes back to
 * the episode they played last. `episodes` is in season and episode
 * order.
 */
export default function SeriesPlayButton({
  episodes,
  className,
}: {
  episodes: Episode[];
  className: string;
}) {
  const { last } = useSeriesProgress(episodes);
  const episode = last ?? episodes[0];

  return (
    <Link href={`/episode/${episode.id}`} className={className}>
      <Play className="h-4 w-4 fill-current" />
      {last ? `Continue S${last.seasonNumber} E${last.episodeNumber}` : "Start Watching"}
    </Link>
  );
}
