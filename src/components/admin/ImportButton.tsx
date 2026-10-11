"use client";

import Link from "next/link";
import { useActionState } from "react";
import { libraryPath } from "@/lib/title-form";
import type { ImportedAs, ImportState } from "@/lib/title-import";

const BUTTON =
  "w-full rounded-card bg-brand-pink px-3 py-1.5 text-xs font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:opacity-60";
const LINK =
  "block w-full rounded-card border border-border-strong px-3 py-1.5 text-center text-xs font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary";

/**
 * A result card's Import button (importTitle in
 * src/lib/admin-import-actions.ts, bound to the card's TMDB id). A clean
 * import opens the new draft, one to check opens the prefilled form, and
 * anything else answers here: a problem, a link to the title already in
 * the library, or, when TMDB and IMDb disagree, which type to import it as.
 */
export default function ImportButton({
  action,
  title,
}: {
  action: (state: ImportState, form: FormData) => Promise<ImportState>;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.existing) return <ImportedLink title={title} imported={state.existing} />;

  if (state.conflict) {
    const { tmdb, imdb } = state.conflict;
    return (
      <form action={formAction} className="flex flex-col gap-2">
        <p className="text-xs text-ink-secondary">
          TMDB: {tmdb}, IMDb: {imdb}. Import it as:
        </p>
        <div className="flex gap-2">
          {(["movie", "series"] as const).map((type) => (
            <button
              key={type}
              type="submit"
              name="as"
              value={type}
              disabled={pending}
              aria-label={`Import ${title} as a ${type}`}
              className={BUTTON}
            >
              {type === "movie" ? "Movie" : "Series"}
            </button>
          ))}
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button type="submit" disabled={pending} aria-label={`Import ${title}`} className={BUTTON}>
        {pending ? "Importing…" : "Import"}
      </button>
      {state.message && (
        <p role="alert" className="text-xs text-status-error">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** A result already in the library (or its trash): a link to its edit page. */
export function ImportedLink({ title, imported }: { title: string; imported: ImportedAs }) {
  return (
    <Link
      href={`${libraryPath(imported.type)}/${imported.id}`}
      aria-label={`${title}: in ${imported.trashed ? "trash" : "library"}`}
      className={LINK}
    >
      {imported.trashed ? "In trash" : "In library"}
    </Link>
  );
}
