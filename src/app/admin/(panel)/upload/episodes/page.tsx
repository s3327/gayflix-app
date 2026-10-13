import type { Metadata } from "next";
import Link from "next/link";
import { BUTTON_PRIMARY } from "@/components/admin/FormFields";
import EpisodeForm from "@/components/admin/EpisodeForm";
import { createEpisode } from "@/lib/admin-catalog-actions";
import { getLastEpisode, listSeriesChoices } from "@/lib/catalog";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";
import type { EpisodeValues } from "@/lib/title-form";

export const metadata: Metadata = {
  title: "Add Episode",
};

/**
 * Adds episodes to a series. ?series=<id> (the "Add an episode" button on
 * a series' page) picks the series and the number after its last episode.
 */
export default async function UploadEpisodesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const series = await listSeriesChoices();
  const requested = firstParam(params.series);
  const chosen = series.find((choice) => choice.id === requested);
  const last = chosen ? await getLastEpisode(chosen.id) : null;

  const initialValues: EpisodeValues = {
    series: chosen?.id ?? "",
    season: String(last?.seasonNumber ?? 1),
    episode: String((last?.episodeNumber ?? 0) + 1),
    title: "",
    minutes: "",
    airDate: "",
  };

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Add an episode</h1>
      {series.length === 0 ? (
        <>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Episodes belong to a series, and there isn&apos;t one yet.
          </p>
          <Link href="/admin/upload/series" className={`mt-6 inline-block ${BUTTON_PRIMARY}`}>
            Add a series first
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            It shows on the site when its series is published. After saving, the form stays open
            for the next episode.
          </p>
          <div className="mt-8">
            <EpisodeForm
              action={createEpisode}
              initialValues={initialValues}
              seriesChoices={series}
              submitLabel="Add episode"
            />
          </div>
        </>
      )}
    </div>
  );
}
