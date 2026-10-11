import Link from "next/link";
import { BUTTON_SECONDARY } from "@/components/admin/FormFields";
import TitleForm from "@/components/admin/TitleForm";
import { createTitle } from "@/lib/admin-catalog-actions";
import { imageHosts } from "@/lib/image-hosts.mjs";
import { parseTmdbRef } from "@/lib/import-mapping";
import type { MediaType } from "@/lib/media";
import { emptyTitleValues, libraryPath } from "@/lib/title-form";
import { prepareImport } from "@/lib/title-import";

/**
 * /admin/upload/movies and /admin/upload/series. Saving opens the new
 * title's edit page (for a series, that's where its episodes are added).
 *
 * With ?tmdb=movie/603 the form comes filled in from TMDB: the Import
 * page opens it when an import needs a look first (a doubtful IMDb match,
 * or a field to fix).
 */
export default async function AddTitlePage({ type, tmdbId }: { type: MediaType; tmdbId?: string }) {
  const isMovie = type === "movie";
  const ref = parseTmdbRef(tmdbId);
  const plan = ref ? await prepareImport(ref, type) : null;
  const heading = isMovie ? "Add a movie" : "Add a series";

  if (plan?.status === "exists") {
    const { id, type: existingType, trashed } = plan.title;
    return (
      <div className="px-6 py-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">{heading}</h1>
        <p className="mt-4 max-w-xl text-sm text-ink-secondary">
          This title is already in the library{trashed && ", in the trash"}.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`${libraryPath(existingType)}/${id}`} className={BUTTON_SECONDARY}>
            Open it
          </Link>
          <Link href="/admin/import" className={BUTTON_SECONDARY}>
            Back to Import
          </Link>
        </div>
      </div>
    );
  }

  const ready = plan?.status === "ready" ? plan : null;
  // Where the title came from, saved with it (createTitle checks them).
  const sources = ready && {
    tmdbId: ready.sources.tmdbId,
    ...(ready.sources.imdbId && { imdbId: ready.sources.imdbId }),
  };
  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">{heading}</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        {ready && "Filled in from TMDB. Check it, fix any marked fields, then add it. "}
        A draft only shows up here in the admin panel. Set the status to Published to put it on
        the site.{!isMovie && " You can add episodes once the series is saved."}
      </p>

      {plan?.status === "failed" && (
        <p role="alert" className="mt-6 max-w-3xl text-sm font-medium text-status-error">
          Couldn&apos;t fill this in from TMDB. {plan.message}
        </p>
      )}
      {ready && ready.notices.length > 0 && (
        <ul className="mt-6 flex max-w-3xl flex-col gap-1.5 rounded-card border border-status-warning/40 bg-status-warning/10 px-5 py-4 text-sm text-ink-primary">
          {ready.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <TitleForm
          type={type}
          action={createTitle.bind(null, type)}
          initialValues={ready?.values ?? emptyTitleValues()}
          initialErrors={ready?.errors}
          hiddenFields={sources ?? undefined}
          imageHosts={imageHosts()}
          lastYear={new Date().getUTCFullYear() + 5}
          submitLabel={isMovie ? "Add movie" : "Add series"}
          cancelHref={ready ? "/admin/import" : libraryPath(type)}
        />
      </div>
    </div>
  );
}
