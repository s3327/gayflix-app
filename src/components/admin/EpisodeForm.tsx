"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  BUTTON_PRIMARY,
  FormMessage,
  SelectField,
  TextField,
} from "@/components/admin/FormFields";
import type { EpisodeValues, FormState } from "@/lib/title-form";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * Adds an episode (with a series picker) or edits one (its series is
 * fixed). The server function checks every field again.
 */
export default function EpisodeForm({
  action,
  initialValues,
  seriesChoices,
  submitLabel,
  initialUpdatedAt,
}: {
  action: Action;
  initialValues: EpisodeValues;
  /** The series to choose from; leave out when editing an episode. */
  seriesChoices?: { id: string; title: string }[];
  submitLabel: string;
  initialUpdatedAt?: Date | string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = { ...initialValues, ...state.values };
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // A reply with problems: start at the first field to fix.
  useEffect(() => {
    if (state.errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    // A new key after each reply re-creates the fields from `values`.
    <form
      ref={formRef}
      key={state.version ?? 0}
      action={formAction}
      noValidate
      className="flex max-w-xl flex-col gap-6"
    >
      {initialUpdatedAt && (
        <input type="hidden" name="loadedAt" value={new Date(initialUpdatedAt).toISOString()} />
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {seriesChoices && (
          <SelectField
            name="series"
            label="Series"
            required
            defaultValue={values.series}
            error={errors.series}
            className="sm:col-span-2"
          >
            <option value="">Choose a series</option>
            {seriesChoices.map((series) => (
              <option key={series.id} value={series.id}>
                {series.title}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          name="season"
          label="Season"
          type="number"
          min={1}
          max={100}
          defaultValue={values.season}
          error={errors.season}
        />
        <TextField
          name="episode"
          label="Episode"
          type="number"
          min={1}
          max={1000}
          defaultValue={values.episode}
          error={errors.episode}
        />
        <TextField
          name="title"
          label="Title"
          defaultValue={values.title}
          error={errors.title}
          maxLength={200}
          className="sm:col-span-2"
        />
        <TextField
          name="minutes"
          label="Length in minutes"
          type="number"
          min={1}
          max={999}
          defaultValue={values.minutes}
          error={errors.minutes}
        />
        <TextField
          name="airDate"
          label="Air date"
          type="date"
          optional
          defaultValue={values.airDate}
          error={errors.airDate}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
