"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  saveSeasonEpisodesAction,
  type SeasonEpisodeRow,
} from "@/lib/admin-catalog-actions";
import { BUTTON_PRIMARY } from "@/components/admin/FormFields";

type EpisodeItem = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  duration: string;
  airDate?: string | Date | null;
  stillUrl?: string | null;
};

export default function SeasonTableEditor({
  seriesId,
  episodes,
  imageHosts,
}: {
  seriesId: string;
  episodes: EpisodeItem[];
  imageHosts: string[];
}) {
  const seasonsMap = new Map<number, EpisodeItem[]>();
  for (const ep of episodes) {
    const list = seasonsMap.get(ep.seasonNumber) ?? [];
    list.push(ep);
    seasonsMap.set(ep.seasonNumber, list);
  }
  const seasonNumbers = Array.from(seasonsMap.keys()).sort((a, b) => a - b);
  const initialSeason = seasonNumbers[0] ?? 1;

  const [activeSeason, setActiveSeason] = useState<number>(initialSeason);

  if (episodes.length === 0) return null;

  return (
    <SeasonTableEditorForm
      key={activeSeason}
      seriesId={seriesId}
      activeSeason={activeSeason}
      seasonNumbers={seasonNumbers}
      episodes={seasonsMap.get(activeSeason) ?? []}
      imageHosts={imageHosts}
      onSelectSeason={setActiveSeason}
    />
  );
}

function SeasonTableEditorForm({
  seriesId,
  activeSeason,
  seasonNumbers,
  episodes,
  imageHosts,
  onSelectSeason,
}: {
  seriesId: string;
  activeSeason: number;
  seasonNumbers: number[];
  episodes: EpisodeItem[];
  imageHosts: string[];
  onSelectSeason: (sNum: number) => void;
}) {
  const [rows, setRows] = useState<SeasonEpisodeRow[]>(() =>
    episodes
      .slice()
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map((ep) => ({
        id: ep.id,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        duration: ep.duration,
        airDate: ep.airDate instanceof Date ? ep.airDate.toISOString() : ep.airDate ?? null,
        stillUrl: ep.stillUrl ?? null,
      }))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateRow = (index: number, field: keyof SeasonEpisodeRow, value: string | number | null) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    const epId = rows[index]?.id;
    if (epId && errors[`${epId}-${field}`]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[`${epId}-${field}`];
        return copy;
      });
    }
  };

  const handleSave = () => {
    setStatusMessage(null);
    setErrors({});

    // Client-side quick check
    const clientErrors: Record<string, string> = {};
    const seen = new Set<number>();
    for (const r of rows) {
      if (!r.title.trim()) {
        clientErrors[`${r.id}-title`] = "Enter the title.";
      }
      if (!r.episodeNumber || r.episodeNumber < 1) {
        clientErrors[`${r.id}-episodeNumber`] = "Enter an episode number.";
      } else if (seen.has(r.episodeNumber)) {
        clientErrors[`${r.id}-episodeNumber`] = `Season ${activeSeason} already has an episode ${r.episodeNumber}.`;
      } else {
        seen.add(r.episodeNumber);
      }
      if (r.stillUrl) {
        try {
          const u = new URL(r.stillUrl);
          if (!imageHosts.includes(u.host)) {
            clientErrors[`${r.id}-stillUrl`] = `Images can only come from ${imageHosts.join(", ")}.`;
          }
        } catch {
          clientErrors[`${r.id}-stillUrl`] = "Use a link that starts with https://.";
        }
      }
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setStatusMessage(Object.values(clientErrors)[0] || "Some fields need fixing.");
      return;
    }

    startTransition(async () => {
      const res = await saveSeasonEpisodesAction(seriesId, activeSeason, rows);
      if (res.ok) {
        setStatusMessage("Saved.");
        setErrors({});
      } else {
        setStatusMessage(res.message || "Some fields need fixing.");
        if (res.errors) setErrors(res.errors);
      }
    });
  };

  if (episodes.length === 0) return null;

  return (
    <section
      aria-label={`Season table editor Season ${activeSeason}`}
      className="mt-8 rounded-card border border-border-subtle bg-bg-surface p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold">
            Season {activeSeason} Table Editor
          </h2>
          {seasonNumbers.length > 1 && (
            <div className="flex gap-1.5">
              {seasonNumbers.map((sNum) => (
                <button
                  key={sNum}
                  type="button"
                  onClick={() => onSelectSeason(sNum)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    activeSeason === sNum
                      ? "bg-brand-pink text-ink-onBrand"
                      : "bg-bg-elevated text-ink-secondary hover:text-ink-primary"
                  }`}
                >
                  Season {sNum}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={`flex items-center gap-2 ${BUTTON_PRIMARY}`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save season
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          className={`mt-4 rounded-md p-3 text-sm font-medium ${
            statusMessage === "Saved."
              ? "bg-status-success/10 text-status-success"
              : "bg-status-error/10 text-status-error"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm text-left">
          <thead>
            <tr className="border-b border-border-subtle text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th className="w-20 px-3 py-2.5">Ep #</th>
              <th className="px-3 py-2.5">Title</th>
              <th className="w-28 px-3 py-2.5">Duration</th>
              <th className="w-48 px-3 py-2.5">Still URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((row, index) => {
              // By id: after a save the episodes come back in their new order.
              const ep = episodes.find((episode) => episode.id === row.id) ?? row;
              const epNumError = errors[`${row.id}-episodeNumber`];
              const titleError = errors[`${row.id}-title`];
              const stillError = errors[`${row.id}-stillUrl`];

              return (
                <tr key={row.id} className="hover:bg-bg-elevated/50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink-secondary">
                        Episode {ep.episodeNumber}
                      </span>
                      <span className="sr-only">
                        Episode {ep.episodeNumber} {ep.title}
                      </span>
                      <input
                        type="number"
                        aria-label="Episode"
                        aria-invalid={Boolean(epNumError)}
                        defaultValue={ep.episodeNumber}
                        onChange={(e) =>
                          updateRow(index, "episodeNumber", Number(e.target.value))
                        }
                        className={`w-16 rounded-md border bg-bg-elevated px-2 py-1.5 text-sm text-ink-primary ${
                          epNumError
                            ? "border-status-error"
                            : "border-border-subtle focus:border-brand-pink"
                        }`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      aria-label="Title"
                      aria-invalid={Boolean(titleError)}
                      defaultValue={ep.title}
                      onChange={(e) => updateRow(index, "title", e.target.value)}
                      className={`w-full rounded-md border bg-bg-elevated px-3 py-1.5 text-sm text-ink-primary ${
                        titleError
                          ? "border-status-error"
                          : "border-border-subtle focus:border-brand-pink"
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      aria-label="Duration"
                      defaultValue={ep.duration}
                      onChange={(e) => updateRow(index, "duration", e.target.value)}
                      className="w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-1.5 text-sm text-ink-primary focus:border-brand-pink"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      placeholder="Still image URL"
                      aria-label="Still thumbnail"
                      aria-invalid={Boolean(stillError)}
                      defaultValue={ep.stillUrl ?? ""}
                      onChange={(e) => updateRow(index, "stillUrl", e.target.value || null)}
                      className={`w-full rounded-md border bg-bg-elevated px-3 py-1.5 text-sm text-ink-primary ${
                        stillError
                          ? "border-status-error"
                          : "border-border-subtle focus:border-brand-pink"
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
