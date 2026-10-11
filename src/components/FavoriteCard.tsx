"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, ListPlus } from "lucide-react";
import { useFavorites, type FavoriteEntry } from "@/lib/favorites-context";
import AddToListModal from "@/components/AddToListModal";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import CardIconButton from "@/components/CardIconButton";
import { titleHref } from "@/lib/title-href";

/**
 * Also carries its own remove (heart) affordance, since this is the one
 * place someone would want to unfavorite without opening the title
 * first — and an "Add to List" affordance, which opens a modal rather
 * than doing anything itself (grouping into lists doesn't touch
 * Favorites at all, see lists-context.tsx).
 */
export default function FavoriteCard({ entry }: { entry: FavoriteEntry }) {
  const { toggleFavorite } = useFavorites();
  const [isAddToListOpen, setIsAddToListOpen] = useState(false);
  const href = titleHref(entry);

  return (
    <div className="group relative">
      <Link href={href} className="block">
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
        icon={Heart}
        onClick={() => toggleFavorite(entry)}
        label="Remove from favorites"
        tone="brand"
        filled
      />

      {isAddToListOpen && (
        <AddToListModal entry={entry} onClose={() => setIsAddToListOpen(false)} />
      )}
    </div>
  );
}
