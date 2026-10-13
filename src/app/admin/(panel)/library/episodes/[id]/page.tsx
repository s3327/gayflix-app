import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import EpisodeForm from "@/components/admin/EpisodeForm";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/components/admin/FormFields";
import VideoSources from "@/components/admin/VideoSources";
import { deleteEpisode, updateEpisode } from "@/lib/admin-catalog-actions";
import { getEpisodeForEdit } from "@/lib/catalog";
import { requireAdmin } from "@/lib/session";
import { episodeValues } from "@/lib/title-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await getEpisodeForEdit(id);
  return { title: row ? `${row.media.title} S${row.seasonNumber}E${row.episodeNumber}` : "Episode" };
}

/**
 * An episode's edit page, with its video. Episodes don't go to the trash:
 * deleting one is for good, after a confirmation.
 */
export default async function EditEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const row = await getEpisodeForEdit(id);
  if (!row) notFound();
  const seriesPath = `/admin/library/series/${row.media.id}`;

  return (
    <div className="px-6 py-10 sm:px-10">
      <Link
        href={seriesPath}
        className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {row.media.title}
      </Link>
      <h1 className="mt-6 break-words font-display text-2xl font-bold">{row.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Season {row.seasonNumber}, episode {row.episodeNumber} of {row.media.title}
      </p>

      {row.media.trashedAt ? (
        <div className="mt-8 max-w-xl rounded-card border border-border-subtle bg-bg-surface p-5">
          <p className="text-sm text-ink-secondary">
            Its series is in the trash. Restore the series to change its episodes.
          </p>
          <Link href="/admin/trash" className={`mt-4 inline-block ${BUTTON_SECONDARY}`}>
            Open the trash
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <EpisodeForm
              action={updateEpisode.bind(null, row.id)}
              initialValues={episodeValues(row)}
              submitLabel="Save changes"
            />
          </div>

          <VideoSources owner="episode" ownerId={row.id} sources={row.videoSources} />

          <section
            aria-labelledby="delete-heading"
            className="mt-12 max-w-xl border-t border-border-subtle pt-8"
          >
            <h2 id="delete-heading" className="font-display text-lg font-bold">
              Delete this episode
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              It&apos;s deleted for good. Episodes don&apos;t go to the trash.
            </p>
            <form action={deleteEpisode.bind(null, row.id)} className="mt-4">
              <ConfirmSubmitButton
                confirmTitle="Delete this episode?"
                confirmDescription={`"${row.title}" will be deleted for good. This can't be undone.`}
                confirmLabel="Delete episode"
                className={BUTTON_DANGER}
              >
                Delete episode
              </ConfirmSubmitButton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
