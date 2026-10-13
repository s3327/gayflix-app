"use client";

import { useState, useTransition } from "react";
import { Download, Loader2, X } from "lucide-react";
import {
  getSeriesTmdbSeasonsAction,
  getTmdbSeasonPreviewAction,
  importSeriesSeasonsAction,
  type TmdbSeasonInfo,
} from "@/lib/admin-catalog-actions";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/admin/FormFields";

type PreviewEpisode = {
  episodeNumber: number;
  title: string;
  runtime: string;
  stillUrl: string | null;
};

export default function ImportEpisodesModal({
  seriesId,
  tmdbId,
}: {
  seriesId: string;
  tmdbId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<TmdbSeasonInfo[]>([]);
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(new Set());
  const [previews, setPreviews] = useState<Record<number, PreviewEpisode[]>>({});
  const [loadingPreview, setLoadingPreview] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setLoading(true);
    setError(null);
    setSubmitError(null);
    getSeriesTmdbSeasonsAction(seriesId)
      .then((res) => {
        if (!res.ok) {
          setError(res.message || "Error loading seasons from TMDB.");
        } else if (res.seasons) {
          setSeasons(res.seasons);
          setSelectedSeasons(new Set(res.seasons.map((s) => s.season_number)));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "TMDB didn't answer. Try again in a minute.");
      })
      .finally(() => setLoading(false));
  };

  const toggleSeason = (seasonNum: number) => {
    const next = new Set(selectedSeasons);
    if (next.has(seasonNum)) next.delete(seasonNum);
    else next.add(seasonNum);
    setSelectedSeasons(next);
  };

  const togglePreview = async (seasonNum: number) => {
    if (previews[seasonNum]) {
      const next = { ...previews };
      delete next[seasonNum];
      setPreviews(next);
      return;
    }
    setLoadingPreview(seasonNum);
    try {
      const res = await getTmdbSeasonPreviewAction(seriesId, seasonNum);
      if (res.ok && res.episodes) {
        setPreviews((prev) => ({ ...prev, [seasonNum]: res.episodes! }));
      } else if (!res.ok) {
        setError(res.message || "Error loading season preview from TMDB.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "TMDB didn't answer. Try again in a minute.");
    } finally {
      setLoadingPreview(null);
    }
  };

  const handleImport = () => {
    if (selectedSeasons.size === 0) {
      setSubmitError("Select at least one season.");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const res = await importSeriesSeasonsAction(seriesId, Array.from(selectedSeasons));
      if (res.ok) {
        setIsOpen(false);
      } else {
        setSubmitError(res.message || "Error importing episodes.");
      }
    });
  };

  if (!tmdbId) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-2 ${BUTTON_SECONDARY}`}
      >
        <Download className="h-4 w-4" />
        Import episodes from TMDB
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-episodes-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-card border border-border-subtle bg-bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h2 id="import-episodes-title" className="font-display text-xl font-bold">
                Import episodes from TMDB
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-sm p-1 text-ink-muted hover:text-ink-primary"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
              </div>
            ) : error ? (
              <div className="py-6">
                <p role="alert" className="text-sm font-medium text-status-error">
                  {error}
                </p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className={BUTTON_SECONDARY}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <p className="text-sm text-ink-secondary">
                  Select seasons to import. Any already-imported episodes will be preserved.
                </p>

                {submitError && (
                  <p role="alert" className="mt-3 text-sm font-medium text-status-error">
                    {submitError}
                  </p>
                )}

                <div className="mt-4 divide-y divide-border-subtle rounded-card border border-border-subtle bg-bg-elevated">
                  {seasons.map((season) => {
                    const isChecked = selectedSeasons.has(season.season_number);
                    const isExpanded = Boolean(previews[season.season_number]);
                    const previewList = previews[season.season_number];

                    return (
                      <div key={season.season_number} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              name={`season-${season.season_number}`}
                              checked={isChecked}
                              onChange={() => toggleSeason(season.season_number)}
                              aria-label={season.name || `Season ${season.season_number}`}
                              className="h-4 w-4 rounded border-border-strong text-brand-pink focus:ring-brand-pink"
                            />
                            <div>
                              <span className="font-medium text-ink-primary">
                                {season.name || `Season ${season.season_number}`}
                              </span>
                              <span className="ml-2 text-xs text-ink-muted">
                                ({season.episode_count} {season.episode_count === 1 ? "episode" : "episodes"})
                              </span>
                            </div>
                          </label>

                          <button
                            type="button"
                            aria-label={`Preview ${season.name || `Season ${season.season_number}`}`}
                            onClick={() => togglePreview(season.season_number)}
                            disabled={loadingPreview === season.season_number}
                            className="text-xs text-ink-brand hover:underline disabled:opacity-50"
                          >
                            {loadingPreview === season.season_number
                              ? "Loading..."
                              : isExpanded
                              ? "Hide preview"
                              : "Preview"}
                          </button>
                        </div>

                        {isExpanded && previewList && (
                          <div className="mt-3 rounded-md bg-bg-surface p-3 text-xs">
                            {previewList.length === 0 ? (
                              <p className="text-ink-muted">0 episodes</p>
                            ) : (
                              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                                {previewList.map((ep) => (
                                  <li
                                    key={ep.episodeNumber}
                                    className="flex items-center justify-between gap-2 text-ink-secondary"
                                  >
                                    <span className="truncate">
                                      Episode {ep.episodeNumber}: {ep.title}
                                    </span>
                                    <span className="shrink-0 text-ink-muted">{ep.runtime}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className={BUTTON_SECONDARY}
                    disabled={isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={isPending || selectedSeasons.size === 0}
                    className={`flex items-center gap-2 ${BUTTON_PRIMARY}`}
                  >
                    {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Import
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
