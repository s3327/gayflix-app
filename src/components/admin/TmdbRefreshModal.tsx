"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X, Check, Loader2, Link2 } from "lucide-react";
import { refreshTitleFromTmdb, fixTitleMatch } from "@/lib/admin-import-actions";

export default function TmdbRefreshModal({
  id,
  currentTmdbId,
  currentImdbId,
}: {
  id: string;
  currentTmdbId?: string | null;
  currentImdbId?: string | null;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [overwrite, setOverwrite] = useState(false);
  const [tmdbIdInput, setTmdbIdInput] = useState(currentTmdbId ?? "");
  const [imdbIdInput, setImdbIdInput] = useState(currentImdbId ?? "");
  const [mode, setMode] = useState<"refresh" | "fix">("refresh");
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleRefresh = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      if (mode === "fix") {
        const res = await fixTitleMatch({
          id,
          tmdbId: tmdbIdInput.trim() || undefined,
          imdbId: imdbIdInput.trim() || undefined,
        });
        if (res.ok) {
          setMessage({ text: "IDs updated successfully!" });
          router.refresh();
          setTimeout(() => setIsOpen(false), 800);
        } else {
          setMessage({ text: res.message || "Failed to update IDs", isError: true });
        }
        return;
      }

      const res = await refreshTitleFromTmdb({
        id,
        overwriteUnlocked: overwrite,
      });

      if (res.ok) {
        const count = res.updatedFields?.length ?? 0;
        setMessage({
          text: count > 0 ? `Refreshed ${count} fields from TMDB!` : "All fields already up to date.",
        });
        router.refresh();
        setTimeout(() => setIsOpen(false), 1000);
      } else {
        setMessage({ text: res.message || "Refresh failed.", isError: true });
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setMessage(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-card border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
      >
        <RefreshCw className="h-3.5 w-3.5 text-brand-pink" />
        Refresh from TMDB
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Refresh metadata from TMDB"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-brand-pink" />
                <h2 className="font-display text-lg font-bold">TMDB Metadata Sync</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-ink-muted hover:text-ink-primary p-1"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="mt-4 flex rounded-md bg-bg-base p-1 border border-border-subtle text-xs">
              <button
                type="button"
                onClick={() => setMode("refresh")}
                className={`flex-1 py-1.5 font-semibold rounded ${
                  mode === "refresh"
                    ? "bg-bg-elevated text-ink-primary shadow-xs"
                    : "text-ink-muted hover:text-ink-secondary"
                }`}
              >
                Refresh Metadata
              </button>
              <button
                type="button"
                onClick={() => setMode("fix")}
                className={`flex-1 py-1.5 font-semibold rounded flex items-center justify-center gap-1 ${
                  mode === "fix"
                    ? "bg-bg-elevated text-ink-primary shadow-xs"
                    : "text-ink-muted hover:text-ink-secondary"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                Fix Match IDs
              </button>
            </div>

            <form onSubmit={handleRefresh} className="mt-4 space-y-4">
              {message && (
                <div
                  className={`p-3 text-xs font-semibold rounded-md border ${
                    message.isError
                      ? "bg-status-error/10 text-status-error border-status-error/20"
                      : "bg-status-success/10 text-status-success border-status-success/20 flex items-center gap-1.5"
                  }`}
                >
                  {!message.isError && <Check className="h-4 w-4 shrink-0" />}
                  {message.text}
                </div>
              )}

              {mode === "refresh" ? (
                <div className="space-y-3">
                  <p className="text-xs text-ink-muted">
                    Fetch the latest synopsis, cast, runtime, posters, and tags from TMDB.
                  </p>
                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border-subtle bg-bg-elevated cursor-pointer select-none">
                    <input
                      type="radio"
                      name="refreshMode"
                      checked={!overwrite}
                      onChange={() => setOverwrite(false)}
                      className="mt-0.5 accent-brand-pink"
                    />
                    <div>
                      <span className="block text-xs font-bold text-ink-primary">
                        Fill missing fields only (Safe)
                      </span>
                      <span className="block text-2xs text-ink-muted mt-0.5">
                        Only updates fields that are currently blank. Hand edits are preserved.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border-subtle bg-bg-elevated cursor-pointer select-none">
                    <input
                      type="radio"
                      name="refreshMode"
                      checked={overwrite}
                      onChange={() => setOverwrite(true)}
                      className="mt-0.5 accent-brand-pink"
                    />
                    <div>
                      <span className="block text-xs font-bold text-ink-primary">
                        Overwrite all unlocked fields
                      </span>
                      <span className="block text-2xs text-ink-muted mt-0.5">
                        Updates overview, cast, runtime, and art with TMDB&apos;s latest data.
                      </span>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                      TMDB ID (e.g. movie/603 or tv/1399)
                    </label>
                    <input
                      type="text"
                      value={tmdbIdInput}
                      onChange={(e) => setTmdbIdInput(e.target.value)}
                      placeholder="movie/12345"
                      className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                      IMDb ID (optional, e.g. tt0133093)
                    </label>
                    <input
                      type="text"
                      value={imdbIdInput}
                      onChange={(e) => setImdbIdInput(e.target.value)}
                      placeholder="tt0133093"
                      className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-card border border-border-strong text-ink-secondary hover:bg-bg-elevated"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold rounded-card bg-brand-pink text-ink-onBrand hover:bg-brand-pink-light flex items-center gap-1.5 disabled:opacity-60 shadow-2xs"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {mode === "refresh" ? "Run Refresh" : "Save Match IDs"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

