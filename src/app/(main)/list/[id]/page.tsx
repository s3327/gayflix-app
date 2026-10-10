"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Layers, Share2, X } from "lucide-react";
import { useLists } from "@/lib/lists-context";
import { useToast } from "@/lib/toast-context";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import CardIconButton from "@/components/CardIconButton";
import { useHydrated } from "@/lib/use-hydrated";
import { titleHref } from "@/lib/title-href";

/**
 * The shareable view a list's "Share" button copies a link to. Reads
 * from ListsProvider (localStorage-backed — see lists-context.tsx), so
 * this only actually shows the list's contents on the same browser that
 * created it. Opening a copied link from a different device/browser
 * currently lands on the "not found" state below — that gap is exactly
 * what the (not built yet) community/backend layer closes: a real
 * share link needs the list to live somewhere everyone can read it from,
 * not localStorage.
 */
export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getList, removeFromList } = useLists();
  const { showToast } = useToast();
  const list = getList(id);

  // The server render and hydration pass can't see localStorage, so they
  // always look like "not found" — show "Loading…" until hydration is
  // done so a real list doesn't flash a false empty state.
  const hasLoaded = useHydrated();

  function handleShare() {
    const url = `${window.location.origin}/list/${id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
    }
    showToast("Link copied to clipboard");
  }

  if (!list) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-8 sm:py-28">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          List Not Found
        </h1>
        <p className="mt-3 text-ink-secondary">
          {hasLoaded
            ? "This list doesn't exist on this browser — it may have been deleted, or the link was opened somewhere it can't be read from yet (no real backend behind sharing yet)."
            : "Loading…"}
        </p>
      </main>
    );
  }

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
          onClick={handleShare}
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
                    {item.year} · {item.duration}
                  </p>
                </Link>

                <CardIconButton
                  icon={X}
                  onClick={() => removeFromList(list.id, item.id)}
                  label="Remove from list"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
          <Layers className="h-8 w-8 text-ink-muted" strokeWidth={1.5} />
          <p className="text-sm text-ink-secondary">
            This list is empty — add titles to it from Favorites.
          </p>
        </div>
      )}
    </main>
  );
}
