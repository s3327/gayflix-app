import TitleForm from "@/components/admin/TitleForm";
import { createTitle } from "@/lib/admin-catalog-actions";
import { imageHosts } from "@/lib/image-hosts.mjs";
import type { MediaType } from "@/lib/media";
import { emptyTitleValues, libraryPath } from "@/lib/title-form";

/**
 * /admin/upload/movies and /admin/upload/series. Saving opens the new
 * title's edit page (for a series, that's where its episodes are added).
 */
export default function AddTitlePage({ type }: { type: MediaType }) {
  const isMovie = type === "movie";
  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">{isMovie ? "Add a movie" : "Add a series"}</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        A draft only shows up here in the admin panel. Set the status to Published to put it on
        the site.{!isMovie && " You can add episodes once the series is saved."}
      </p>
      <div className="mt-8">
        <TitleForm
          type={type}
          action={createTitle.bind(null, type)}
          initialValues={emptyTitleValues()}
          imageHosts={imageHosts()}
          lastYear={new Date().getUTCFullYear() + 5}
          submitLabel={isMovie ? "Add movie" : "Add series"}
          cancelHref={libraryPath(type)}
        />
      </div>
    </div>
  );
}
