"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CheckboxField,
  FormMessage,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/admin/FormFields";
import ImageField from "@/components/admin/ImageField";
import type { MediaType } from "@/lib/media";
import { CONTENT_NOTES, maturityLabel, MATURITY_RATINGS } from "@/lib/title-extras";
import { FIRST_YEAR, type FormState, type TitleValues } from "@/lib/title-form";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * Adds or edits a movie or a series. The server function checks every
 * field again (src/lib/title-form.ts); the browser's checks only save a
 * round trip.
 */
export default function TitleForm({
  type,
  action,
  initialValues,
  initialErrors,
  hiddenFields = {},
  imageHosts,
  uploadHost,
  lastYear,
  submitLabel,
  cancelHref,
  currentHero,
  currentTitleId,
  initialUpdatedAt,
  existingTitles,
}: {
  type: MediaType;
  action: Action;
  initialValues: TitleValues;
  /** Fields to fix before the first save: an import's, say. */
  initialErrors?: Record<string, string>;
  /** Sent with every save: where an imported title came from. */
  hiddenFields?: Record<string, string>;
  /** Where poster links may point (src/lib/image-hosts.mjs). */
  imageHosts: string[];
  /** Where uploaded images go, when uploads are on (uploadHost()). */
  uploadHost?: string;
  lastYear: number;
  submitLabel: string;
  cancelHref?: string;
  /** The current home page hero title to inform about replacements */
  currentHero?: { id: string; title: string } | null;
  /** ID of the title being edited */
  currentTitleId?: string;
  /** Last updated timestamp for optimistic concurrency / save conflict check */
  initialUpdatedAt?: Date | string | null;
  /** Existing titles in the library to check for duplicates */
  existingTitles?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = { ...initialValues, ...state.values };
  // Until the first reply, the problems the page came with.
  const errors = state.version === undefined ? (initialErrors ?? {}) : (state.errors ?? {});
  const hasErrors = Object.keys(errors).length > 0;
  const isMovie = type === "movie";
  const canUpload = Boolean(uploadHost);
  // The Blob store's long host isn't one to paste links from.
  const linkHosts = imageHosts.filter((host) => host !== uploadHost).join(", ");
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [enteredTitle, setEnteredTitle] = useState(values.title || "");
  // Edits are unsaved until a save goes through: a reply with problems
  // still holds what was typed, not what's stored.
  const unsaved = !pending && (dirty || (state.version !== undefined && hasErrors));

  const trimmedTitle = enteredTitle.trim().toLowerCase();
  const duplicateMatch =
    existingTitles && trimmedTitle
      ? existingTitles.find((t) => t.trim().toLowerCase() === trimmedTitle)
      : null;

  // Warn before unsaved changes are lost: closing or reloading the tab, and
  // following a link inside the panel (which beforeunload doesn't see).
  useEffect(() => {
    if (!unsaved) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }
      const to = new URL(link.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      if (!window.confirm("You have unsaved changes. Leave this page without saving them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    // Capture, so this runs before the Link that would navigate.
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [unsaved]);

  // Problems to fix: start at the first one.
  useEffect(() => {
    if (hasErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, hasErrors]);

  const isCurrentHero = Boolean(currentHero && currentTitleId && currentHero.id === currentTitleId);
  const featuredHint = isCurrentHero
    ? "Currently featured as the home page hero."
    : currentHero
      ? `Replaces "${currentHero.title}" as the home page hero when published.`
      : "Features this title as the hero on the home page when published.";

  return (
    // A new key after each reply re-creates the fields from `values`:
    // React clears a form once it's submitted.
    <form
      ref={formRef}
      key={state.version ?? 0}
      action={(formData) => {
        setDirty(false);
        formAction(formData);
      }}
      onChange={() => setDirty(true)}
      noValidate
      className="flex max-w-3xl flex-col gap-6"
    >
      {initialUpdatedAt && (
        <input type="hidden" name="loadedAt" value={new Date(initialUpdatedAt).toISOString()} />
      )}
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="status" label="Status" defaultValue={values.status}>
          <option value="draft">Draft (not on the site)</option>
          <option value="published">Published</option>
        </SelectField>
        <TextField
          name="publishAt"
          type="datetime-local"
          label="Publish at (UTC)"
          optional
          defaultValue={values.publishAt}
          hint="For a draft: it goes live at the first daily publishing run (03:15 UTC) from this time. Publishing it yourself clears this."
          error={errors.publishAt}
        />
        <div className="flex items-end pb-1">
          <CheckboxField
            name="featured"
            label="Feature on the home page"
            hint={featuredHint}
            defaultChecked={values.featured === "on"}
          />
        </div>

        <TextField
          name="title"
          label="Title"
          defaultValue={values.title}
          onChange={(e) => setEnteredTitle(e.target.value)}
          hint={
            duplicateMatch ? (
              <span className="font-medium text-status-warning">
                A title named “{duplicateMatch}” already exists.
              </span>
            ) : undefined
          }
          error={errors.title}
          maxLength={200}
          className="sm:col-span-2"
        />
        <TextField
          name="year"
          label="Year"
          type="number"
          min={FIRST_YEAR}
          max={lastYear}
          defaultValue={values.year}
          error={errors.year}
        />
        <TextField
          name="releaseDate"
          label="Release date"
          type="date"
          optional
          defaultValue={values.releaseDate}
          error={errors.releaseDate}
        />
        {isMovie && (
          <TextField
            name="runtime"
            label="Runtime in minutes"
            type="number"
            min={1}
            max={999}
            defaultValue={values.runtime}
            error={errors.runtime}
          />
        )}
        <TextField
          name="rating"
          label="Rating"
          type="number"
          min={0}
          max={5}
          step={0.1}
          optional
          hint="From 0 to 5."
          defaultValue={values.rating}
          error={errors.rating}
        />

        <TextField
          name="genres"
          label="Genres"
          hint="Separate them with commas. Cards show the first one."
          defaultValue={values.genres}
          error={errors.genres}
          className="sm:col-span-2"
        />
        <TextField
          name="country"
          label="Country"
          defaultValue={values.country}
          error={errors.country}
          maxLength={60}
        />
        <TextField
          name="language"
          label="Language"
          defaultValue={values.language}
          error={errors.language}
          maxLength={60}
        />
        <TextField
          name="credit"
          label={isMovie ? "Director" : "Creator"}
          optional
          defaultValue={values.credit}
          error={errors.credit}
          maxLength={120}
        />
        <TextField
          name="cast"
          label="Cast"
          optional
          hint="Separate names with commas."
          defaultValue={values.cast}
          error={errors.cast}
        />
        <TextField
          name="tags"
          label="Tags"
          optional
          hint="Separate them with commas."
          defaultValue={values.tags}
          error={errors.tags}
          className="sm:col-span-2"
        />
        <TextField
          name="tagline"
          label="Tagline"
          optional
          defaultValue={values.tagline}
          error={errors.tagline}
          maxLength={200}
          className="sm:col-span-2"
        />
        <TextAreaField
          name="synopsis"
          label="Synopsis"
          optional
          defaultValue={values.synopsis}
          error={errors.synopsis}
          maxLength={5000}
          className="sm:col-span-2"
        />

        <ImageField
          kind="poster"
          label="Poster image link"
          optional
          hint={
            canUpload
              ? `A tall (2:3) image. Upload one, or paste a link to one on ${linkHosts}. Left empty, the title shows the “No poster yet” image.`
              : `A tall (2:3) image on ${linkHosts}. Left empty, the title shows the “No poster yet” image.`
          }
          defaultValue={values.posterUrl}
          error={errors.posterUrl}
          canUpload={canUpload}
          className="sm:col-span-2"
        />
        <ImageField
          kind="backdrop"
          label="Backdrop image link"
          optional
          hint="A wide (16:9) image, shown at the top of the title's page, and of the home page when the title is featured."
          defaultValue={values.backdropUrl}
          error={errors.backdropUrl}
          canUpload={canUpload}
          className="sm:col-span-2"
        />

        <TextField
          name="trailerUrl"
          label="Trailer"
          type="url"
          optional
          hint="A YouTube link. The title's page plays it in YouTube's privacy-enhanced player."
          defaultValue={values.trailerUrl}
          error={errors.trailerUrl}
          autoComplete="off"
          spellCheck={false}
          className="sm:col-span-2"
        />
        <SelectField
          name="maturityRating"
          label="Suitable for"
          hint="Its maturity rating: the youngest age it's for."
          defaultValue={values.maturityRating}
          error={errors.maturityRating}
        >
          <option value="">Not rated</option>
          {MATURITY_RATINGS.map((rating) => (
            <option key={rating} value={rating}>
              {maturityLabel(rating)}
            </option>
          ))}
        </SelectField>
        <fieldset
          aria-describedby={errors.contentNotes ? "field-contentNotes-error" : "field-contentNotes-hint"}
          className="sm:col-span-2"
        >
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Content notes <span className="font-normal normal-case tracking-normal text-ink-muted">(optional)</span>
          </legend>
          <p id="field-contentNotes-hint" className="mt-1 text-xs text-ink-muted">
            Shown on the title&apos;s page as &ldquo;Contains: …&rdquo;, so viewers can choose.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CONTENT_NOTES.map(([code, label]) => (
              <label key={code} className="flex items-center gap-3 text-sm text-ink-primary">
                <input
                  type="checkbox"
                  name="contentNotes"
                  value={code}
                  defaultChecked={values.contentNotes.split(",").includes(code)}
                  className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
                />
                {label}
              </label>
            ))}
          </div>
          {errors.contentNotes && (
            <p id="field-contentNotes-error" className="mt-1 text-xs font-medium text-status-error">
              {errors.contentNotes}
            </p>
          )}
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {cancelHref && (
          <Link href={cancelHref} className={BUTTON_SECONDARY}>
            Cancel
          </Link>
        )}
        <FormMessage state={state} />
      </div>
    </form>
  );
}
