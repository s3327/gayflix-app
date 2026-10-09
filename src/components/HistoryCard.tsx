"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useHistory, type HistoryEntry } from "@/lib/history-context";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import CardIconButton from "@/components/CardIconButton";

function formatWatchedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const { removeFromHistory } = useHistory();
  const href = entry.type === "movie" ? `/movie/${entry.id}` : `/series/${entry.id}`;

  return (
    <div className="group relative">
      <Link href={href} className="block">
        <MediaCoverThumb entry={entry} />

        <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
          {entry.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-secondary">
          Watched {formatWatchedAt(entry.watchedAt)}
        </p>
      </Link>

      <CardIconButton
        icon={X}
        onClick={() => removeFromHistory(entry.id)}
        label="Remove from history"
      />
    </div>
  );
}
