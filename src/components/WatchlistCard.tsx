"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkCheck, ListPlus } from "lucide-react";
import AddToListModal from "@/components/AddToListModal";
import CardIconButton from "@/components/CardIconButton";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import type { FavoriteEntry } from "@/lib/library-types";
import { titleHref } from "@/lib/title-href";
import { useWatchlist } from "@/lib/watchlist-context";

/**
 * A title on the Watchlist tab: like FavoriteCard, with its own remove
 * (the bookmark, which offers Undo) and Add to List.
 */
export default function WatchlistCard({ entry }: { entry: FavoriteEntry }) {
  const { toggleWatchlist } = useWatchlist();
  const [isAddToListOpen, setIsAddToListOpen] = useState(false);

  return (
    <div className="group relative">
      <Link href={titleHref(entry)} className="block">
        <MediaCoverThumb entry={entry} />

        <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
          {entry.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-secondary">
          {[entry.year, entry.duration].filter(Boolean).join(" · ")}
        </p>
      </Link>

      <CardIconButton
        icon={ListPlus}
        onClick={() => setIsAddToListOpen(true)}
        label="Add to list"
        position="left"
      />

      <CardIconButton
        icon={BookmarkCheck}
        onClick={() => toggleWatchlist(entry)}
        label={`Remove ${entry.title} from watchlist`}
        tone="brand"
      />

      {isAddToListOpen && (
        <AddToListModal entry={entry} onClose={() => setIsAddToListOpen(false)} />
      )}
    </div>
  );
}
