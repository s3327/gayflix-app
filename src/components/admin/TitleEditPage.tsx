import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import Badge from "@/components/Badge";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/admin/FormFields";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import TitleForm from "@/components/admin/TitleForm";
import VideoSources from "@/components/admin/VideoSources";
import { restoreTitle, trashTitle, updateTitle } from "@/lib/admin-catalog-actions";
import { getLiveHero, getTitleForEdit } from "@/lib/catalog";
import { imageHosts, uploadHost } from "@/lib/image-hosts.mjs";
import type { MediaType } from "@/lib/media";
import { imageUrlProblem, libraryPath, NO_POSTER, titleValues } from "@/lib/title-form";
import { titleHref } from "@/lib/title-href";

/**
 * /admin/library/movies/[id] and /admin/library/series/[id]: a title's
 * edit page, with its video for a movie and its episodes for a series. A
 * title in the trash can only be restored. Admins only (getTitleForEdit
 * checks too).
 */
export default async function TitleEditPage({
  type,
  id,
  added,
  imported,
}: {
  type: MediaType;
  id: string;
  /** Just added: createTitle opens the page with ?added=1. */
  added: boolean;
  /** Just imported: the Import page opens it with ?imported=1. */
  imported: boolean;
}) {
  const [row, currentHero] = await Promise.all([getTitleForEdit(id), getLiveHero()]);
  if (!row) notFound();
  // A series opened under /movies (or the other way round).
  if (row.type !== type) redirect(`${libraryPath(row.type)}/${row.id}`);

  const isSeries = row.type === "series";
  const isTrashed = row.trashedAt !== null;
  const isPublished = row.status === "published";
  const hosts = imageHosts();
  // next/image refuses hosts that aren't allowed (any more): show the
  // gradient instead.
  const posterUrl =
    row.posterUrl === NO_POSTER || !imageUrlProblem(row.posterUrl, hosts) ? row.posterUrl : undefined;

  return (
    <div className="px-6 py-10 sm:px-10">
      <Link
        href={libraryPath(row.type)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {isSeries ? "Series" : "Movies"}
      </Link>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div className="w-24 shrink-0">
          <MediaCoverThumb
            entry={{ title: row.title, posterUrl, gradient: row.gradient ?? undefined }}
            sizes="96px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-display text-2xl font-bold">{row.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge tone={isPublished && !isTrashed ? "success" : "neutral"}>
              {isTrashed ? "In the trash" : isPublished ? "Published" : "Draft"}
            </Badge>
            <span className="text-sm text-ink-muted">{titleHref(row)}</span>
          </div>
          {row.tmdbId && <SourceLine tmdbId={row.tmdbId} imdbId={row.imdbId} />}
          {!isTrashed && (
            <div className="mt-4 flex flex-wrap gap-3">
              {isPublished && (
                <Link href={titleHref(row)} className={BUTTON_SECONDARY}>
                  View on the site
                </Link>
              )}
              <form action={trashTitle.bind(null, row.id)}>
                <ConfirmSubmitButton
                  confirmTitle="Move this title to the trash?"
                  confirmDescription={`"${row.title}" will be taken off the site. Any unsaved edits will be discarded.`}
                  confirmLabel="Move to trash"
                  className={BUTTON_DANGER}
                >
                  Move to trash
                </ConfirmSubmitButton>
              </form>
            </div>
          )}
        </div>
      </div>

      {(added || imported) && !isTrashed && (
        <>
          <p role="status" className="mt-8 max-w-3xl text-sm font-medium text-status-success">
            {imported
              ? isPublished
                ? "Imported and published."
                : "Imported as a draft. Check it, then set its status to Published when it's ready."
              : isPublished
                ? "Added and published."
                : "Added as a draft. Set its status to Published when it's ready."}
            {isSeries && " Next, add its episodes below."}
          </p>
          <script
            dangerouslySetInnerHTML={{
              __html:
                'if (typeof window !== "undefined" && window.history.replaceState) { const u = new URL(window.location.href); if (u.searchParams.has("added") || u.searchParams.has("imported")) { u.searchParams.delete("added"); u.searchParams.delete("imported"); window.history.replaceState({}, "", u.pathname + (u.search ? u.search : "")); } }',
            }}
          />
        </>
      )}

      <div className="mt-8">
        {isTrashed ? (
          <div className="max-w-xl rounded-card border border-border-subtle bg-bg-surface p-5">
            <p className="text-sm text-ink-secondary">
              This title is in the trash, so it&apos;s off the site. Restore it to edit it.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={restoreTitle.bind(null, row.id)}>
                <button type="submit" className={BUTTON_PRIMARY}>
                  Restore
                </button>
              </form>
              <Link href="/admin/trash" className={BUTTON_SECONDARY}>
                Open the trash
              </Link>
            </div>
          </div>
        ) : (
          <TitleForm
            type={row.type}
            action={updateTitle.bind(null, row.id)}
            initialValues={titleValues(row)}
            imageHosts={hosts}
            uploadHost={uploadHost()}
            lastYear={new Date().getUTCFullYear() + 5}
            submitLabel="Save changes"
            currentHero={currentHero}
            currentTitleId={row.id}
            initialUpdatedAt={row.updatedAt}
          />
        )}
      </div>

      {!isSeries && !isTrashed && (
        <VideoSources owner="movie" ownerId={row.id} sources={row.videoSources} />
      )}

      {isSeries && (
        <section aria-labelledby="episodes-heading" className="mt-12 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="episodes-heading" className="font-display text-xl font-bold">
              Episodes
            </h2>
            {!isTrashed && (
              <Link
                href={`/admin/upload/episodes?series=${row.id}`}
                className={`flex items-center gap-2 ${BUTTON_SECONDARY}`}
              >
                <Plus className="h-4 w-4" />
                Add an episode
              </Link>
            )}
          </div>
          {row.episodes.length === 0 ? (
            <p className="mt-4 text-sm text-ink-secondary">No episodes yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
              {row.episodes.map((episode) => (
                <li key={episode.id}>
                  <Link
                    href={`/admin/library/episodes/${episode.id}`}
                    className="flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-bg-elevated"
                  >
                    <span className="w-24 shrink-0 text-ink-muted">
                      <span aria-hidden="true">
                        S{episode.seasonNumber} · E{episode.episodeNumber}
                      </span>
                      <span className="sr-only">
                        Season {episode.seasonNumber}, episode {episode.episodeNumber}:
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-primary">
                      {episode.title}
                    </span>
                    <span className="shrink-0 text-ink-muted">{episode.duration}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

const SOURCE_LINK = "text-ink-secondary underline underline-offset-2 transition-colors hover:text-ink-primary";

/** Where an imported title came from, and whether it matched IMDb. */
function SourceLine({ tmdbId, imdbId }: { tmdbId: string; imdbId: string | null }) {
  return (
    <p className="mt-2 text-sm text-ink-muted">
      Imported from{" "}
      <a href={`https://www.themoviedb.org/${tmdbId}`} className={SOURCE_LINK}>
        TMDB
      </a>
      {" · "}
      {imdbId ? (
        <>
          Matches{" "}
          <a href={`https://www.imdb.com/title/${imdbId}/`} className={SOURCE_LINK}>
            IMDb {imdbId}
          </a>
        </>
      ) : (
        "Not checked against IMDb"
      )}
    </p>
  );
}
