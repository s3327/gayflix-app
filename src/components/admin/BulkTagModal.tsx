"use client";

import { useState, useTransition } from "react";
import { X, Tag, Loader2 } from "lucide-react";
import { bulkTagTitles } from "@/lib/admin-catalog-actions";

export default function BulkTagModal({
  selectedIds,
  onClose,
  onCompleted,
}: {
  selectedIds: string[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [addTags, setAddTags] = useState("");
  const [addGenres, setAddGenres] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const tagsList = addTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const genresList = addGenres
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);

    if (tagsList.length === 0 && genresList.length === 0) {
      setError("Please specify at least one tag or genre to add.");
      return;
    }

    startTransition(async () => {
      const res = await bulkTagTitles({
        ids: selectedIds,
        addTags: tagsList,
        addGenres: genresList,
      });
      if (res.ok) {
        onCompleted();
        onClose();
      } else {
        setError("Failed to apply tags.");
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bulk Tag Titles"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-brand-pink" />
            <h2 className="font-display text-lg font-bold">
              Tag {selectedIds.length} {selectedIds.length === 1 ? "Title" : "Titles"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink-primary p-1"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-2.5 text-xs font-semibold rounded-md bg-status-error/10 text-status-error border border-status-error/20">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Add Tags (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. Pride 2026, Award Winner, Staff Pick"
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
            <p className="mt-1 text-2xs text-ink-muted">Existing tags on each title will be preserved.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Add Genres (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. Comedy, Romance, Indie"
              value={addGenres}
              onChange={(e) => setAddGenres(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-card border border-border-strong text-ink-secondary hover:bg-bg-elevated"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs font-bold rounded-card bg-brand-pink text-ink-onBrand hover:bg-brand-pink-light flex items-center gap-1.5 disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Apply to {selectedIds.length} titles
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

