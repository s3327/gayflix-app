"use client";

import { useState } from "react";
import type { RecentlyWatched } from "@/lib/media";
import { SAVE_FAILED } from "@/lib/favorites-context";
import { setHiddenFromContinue } from "@/lib/library-actions";
import { useToast } from "@/lib/toast-context";
import ContinueWatchingCard from "@/components/ContinueWatchingCard";

const MAX_VISIBLE = 6;

/**
 * The signed-in user's latest titles (listContinueWatching in
 * src/lib/catalog.ts). Remove takes a title off the row, with Undo; it
 * stays in History.
 */
export default function ContinueWatchingSection({ items }: { items: RecentlyWatched[] }) {
  const { showToast } = useToast();
  // History ids taken off the row since the page loaded.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  function show(historyId: string, shown: boolean) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (shown) next.delete(historyId);
      else next.add(historyId);
      return next;
    });
  }

  function save(historyId: string, hidden: boolean) {
    show(historyId, !hidden);
    setHiddenFromContinue(historyId, hidden).catch(() => {
      show(historyId, hidden);
      showToast(SAVE_FAILED, { type: "error" });
    });
  }

  function remove(item: RecentlyWatched) {
    save(item.historyId, true);
    showToast(`Removed ${item.title} from Continue Watching`, {
      action: { label: "Undo", onClick: () => save(item.historyId, false) },
    });
  }

  // The visibility classes below expect at most 6.
  const visible = items.filter((item) => !removed.has(item.historyId)).slice(0, MAX_VISIBLE);
  if (visible.length === 0) return null;

  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="mb-4 px-4 font-display text-xl font-semibold sm:px-8">
        Continue Watching
      </h2>

      <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 sm:gap-4 sm:px-8 lg:grid-cols-6">
        {visible.map((item, index) => {
          // Keeps the row to exactly one row at every breakpoint instead of
          // wrapping: mobile shows the first 3, tablet the first 4,
          // desktop all 6 — matching each breakpoint's column count.
          const visibilityClass =
            index < 3 ? "" : index === 3 ? "hidden sm:block" : "hidden lg:block";

          return (
            <div key={item.id} className={visibilityClass}>
              <ContinueWatchingCard item={item} onRemove={() => remove(item)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
