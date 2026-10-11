"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CheckboxField,
  FormMessage,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/admin/FormFields";
import type { MediaType } from "@/lib/media";
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
  lastYear,
  submitLabel,
  cancelHref,
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
  lastYear: number;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = { ...initialValues, ...state.values };
  // Until the first reply, the problems the page came with.
  const errors = state.version === undefined ? (initialErrors ?? {}) : (state.errors ?? {});
  const hasErrors = Object.keys(errors).length > 0;
  const isMovie = type === "movie";
  const formRef = useRef<HTMLFormElement>(null);

  // Problems to fix: start at the first one.
  useEffect(() => {
    if (hasErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, hasErrors]);

  return (
    // A new key after each reply re-creates the fields from `values`:
    // React clears a form once it's submitted.
    <form ref={formRef} key={state.version ?? 0} action={formAction} className="flex max-w-3xl flex-col gap-6">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="status" label="Status" defaultValue={values.status}>
          <option value="draft">Draft (not on the site)</option>
          <option value="published">Published</option>
        </SelectField>
        <div className="flex items-end pb-1">
          <CheckboxField
            name="featured"
            label="Feature on the home page"
            hint="It replaces the title featured now."
            defaultChecked={values.featured === "on"}
          />
        </div>

        <TextField
          name="title"
          label="Title"
          defaultValue={values.title}
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

        <TextField
          name="posterUrl"
          label="Poster image link"
          type="url"
          optional
          hint={`A tall (2:3) image on ${imageHosts.join(", ")}. Left empty, the title shows the “No poster yet” image.`}
          defaultValue={values.posterUrl}
          error={errors.posterUrl}
          className="sm:col-span-2"
        />
        <TextField
          name="backdropUrl"
          label="Backdrop image link"
          type="url"
          optional
          hint="A wide (16:9) image, shown at the top of the home page when the title is featured."
          defaultValue={values.backdropUrl}
          error={errors.backdropUrl}
          className="sm:col-span-2"
        />
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
