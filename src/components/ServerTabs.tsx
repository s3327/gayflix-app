"use client";

import type { VideoSourceEntry } from "@/lib/video-source";

/**
 * One button per video source (added on the title's or the episode's
 * admin page), named by its label, in the admin's order. WatchPlayer
 * owns which one is chosen and plays it.
 */
export default function ServerTabs({
  sources,
  active,
  onSelect,
}: {
  sources: Pick<VideoSourceEntry, "id" | "label">[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div role="group" aria-label="Servers" className="flex flex-wrap gap-2">
      {sources.map((source, i) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onSelect(i)}
          aria-pressed={i === active}
          className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
            i === active
              ? "border-brand-pink bg-brand-pink/10 text-ink-brand"
              : "border-border-subtle text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  );
}
