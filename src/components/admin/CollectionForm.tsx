"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  BUTTON_PRIMARY,
  CheckboxField,
  FormMessage,
  TextAreaField,
  TextField,
} from "@/components/admin/FormFields";
import { COLLECTION_DESCRIPTION_MAX, COLLECTION_TITLE_MAX } from "@/lib/collection-form";
import type { FormState } from "@/lib/title-form";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

export type CollectionValues = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  published: boolean;
  onHome: boolean;
};

/**
 * A collection's fields (/admin/collections): new (with its address) or
 * editing (the address is fixed). The server function checks every
 * field again.
 */
export default function CollectionForm({
  action,
  initialValues,
  isNew,
  submitLabel,
}: {
  action: Action;
  initialValues: CollectionValues;
  isNew?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values: CollectionValues = state.values
    ? {
        ...initialValues,
        ...state.values,
        published: state.values.published === "on",
        onHome: state.values.onHome === "on",
      }
    : initialValues;
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      key={state.version ?? 0}
      action={formAction}
      noValidate
      className="flex max-w-xl flex-col gap-5"
    >
      <TextField
        name="title"
        label="Title"
        maxLength={COLLECTION_TITLE_MAX}
        defaultValue={values.title}
        error={errors.title}
      />
      {isNew && (
        <TextField
          name="id"
          label="Address"
          optional
          placeholder="pride-month"
          hint="Shown as /collections/pride-month. Left empty, it's made from the title. It can't change later."
          defaultValue={values.id}
          error={errors.id}
        />
      )}
      <TextAreaField
        name="description"
        label="Description"
        optional
        maxLength={COLLECTION_DESCRIPTION_MAX}
        defaultValue={values.description}
        error={errors.description}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="startsAt"
          label="Show from"
          type="date"
          optional
          hint="For a season, like Pride Month. Empty: always."
          defaultValue={values.startsAt}
          error={errors.startsAt}
        />
        <TextField
          name="endsAt"
          label="Show until"
          type="date"
          optional
          hint="The last day it shows (UTC)."
          defaultValue={values.endsAt}
          error={errors.endsAt}
        />
      </div>
      <CheckboxField
        name="published"
        label="Published"
        hint="Shown on /collections (within its dates). Only published titles in it show."
        defaultChecked={values.published}
      />
      <CheckboxField
        name="onHome"
        label="Row on the home page"
        hint="The first three published collections with this on get a home page row."
        defaultChecked={values.onHome}
      />
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {submitLabel}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
