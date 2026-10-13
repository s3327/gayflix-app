"use client";

import { useState, useTransition } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { quickUpdateTitle } from "@/lib/admin-catalog-actions";
import type { LibraryRow } from "@/lib/catalog";

export default function QuickEditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: LibraryRow | null;
  onClose: () => void;
  onSaved?: (updated: Partial<LibraryRow>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Form states initialized when item is provided
  const [title, setTitle] = useState(item?.title ?? "");
  const [year, setYear] = useState(item?.year ?? new Date().getFullYear());
  const [status, setStatus] = useState<"draft" | "published">(item?.status ?? "draft");
  const [duration, setDuration] = useState(item?.duration ?? "");
  const [genres, setGenres] = useState(item?.genres?.join(", ") ?? "");
  const [tagline, setTagline] = useState(item?.tagline ?? "");
  const [rating, setRating] = useState(item?.rating != null ? String(item.rating) : "");

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const parsedYear = Number(year);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (isNaN(parsedYear) || parsedYear < 1888 || parsedYear > 2100) {
      setError("Please enter a valid release year.");
      return;
    }

    const parsedRating = rating.trim() ? Number(rating) : undefined;
    if (parsedRating !== undefined && (isNaN(parsedRating) || parsedRating < 0 || parsedRating > 5)) {
      setError("Rating must be between 0.0 and 5.0.");
      return;
    }

    startTransition(async () => {
      const parsedGenres = genres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      const res = await quickUpdateTitle({
        id: item.id,
        title: title.trim(),
        year: parsedYear,
        status,
        duration: duration.trim() || undefined,
        genres: parsedGenres.length > 0 ? parsedGenres : undefined,
        tagline: tagline.trim() || null,
        rating: parsedRating,
      });

      if (!res.ok) {
        setError(res.message || "Failed to update title.");
      } else {
        setSuccess(true);
        onSaved?.({
          title: title.trim(),
          year: parsedYear,
          status,
          duration: duration.trim() || undefined,
          genres: parsedGenres,
          tagline: tagline.trim() || null,
          rating: parsedRating,
        });
        setTimeout(() => {
          onClose();
        }, 600);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick edit title"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-surface border-l border-border-subtle h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="font-display text-lg font-bold">Quick Edit</h2>
            <p className="text-xs text-ink-muted truncate max-w-[280px]">{item.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="text-ink-muted hover:text-ink-primary p-1 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs font-semibold rounded-md bg-status-error/10 text-status-error border border-status-error/20">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-xs font-semibold rounded-md bg-status-success/10 text-status-success border border-status-success/20 flex items-center gap-2">
              <Check className="h-4 w-4" /> Changes saved!
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                Year
              </label>
              <input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Duration / Runtime
            </label>
            <input
              type="text"
              placeholder={item.type === "movie" ? "1h 45m" : "2 Seasons"}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Genres (comma-separated)
            </label>
            <input
              type="text"
              placeholder="Drama, Romance, LGBTQ+"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="quick-edit-tagline" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Tagline
            </label>
            <input
              id="quick-edit-tagline"
              type="text"
              placeholder="Catchphrase or short logline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="quick-edit-rating" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
              Rating (0.0 to 5.0)
            </label>
            <input
              id="quick-edit-rating"
              type="number"
              step="0.1"
              min="0"
              max="5"
              placeholder="e.g. 4.8"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
            />
          </div>

          <div className="pt-4 border-t border-border-subtle flex justify-end gap-3">
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
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

