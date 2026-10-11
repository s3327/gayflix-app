"use client";

import Link from "next/link";
import { Layers, Share2, X } from "lucide-react";
import { copyListLink, useLists, type MediaList } from "@/lib/lists-context";
import { useToast } from "@/lib/toast-context";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import CardIconButton from "@/components/CardIconButton";
import { titleHref } from "@/lib/title-href";

/**
 * The shareable view a list's "Share" button copies a link to. The page
 * loads the list from the database, so the link works for anyone. The
 * owner sees their own live copy (from ListsProvider), so removing a
 * title updates straight away; everyone else gets a read-only view.
 */
export default function ListView({
  list: saved,
  isOwner,
}: {
  list: MediaList;
  isOwner: boolean;
}) {
  const { getList, removeFromList } = useLists();
  const { showToast } = useToast();
  const list = (isOwner && getList(saved.id)) || saved;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{list.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {list.items.length} {list.items.length === 1 ? "title" : "titles"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => copyListLink(list.id, showToast)}
          className="flex items-center gap-2 rounded-card border border-border-strong px-5 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>

      {list.items.length > 0 ? (
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
          {list.items.map((item) => {
            const href = titleHref(item);
            return (
              <div key={item.id} className="group relative">
                <Link href={href} className="block">
                  <MediaCoverThumb entry={item} />

                  <p className="mt-2 truncate font-display text-sm font-semibold leading-tight text-ink-primary">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-secondary">
                    {[item.year, item.duration].filter(Boolean).join(" · ")}
                  </p>
                </Link>

                {isOwner && (
                  <CardIconButton
                    icon={X}
                    onClick={() => removeFromList(list.id, item.id)}
                    label="Remove from list"
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
          <Layers className="h-8 w-8 text-ink-muted" strokeWidth={1.5} />
          <p className="text-sm text-ink-secondary">
            {isOwner
              ? "This list is empty — add titles to it from Favorites."
              : "This list is empty."}
          </p>
        </div>
      )}
    </main>
  );
}
