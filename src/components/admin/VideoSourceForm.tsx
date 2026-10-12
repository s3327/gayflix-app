"use client";

import { useActionState, useEffect, useRef } from "react";
import { BUTTON_PRIMARY, FormMessage, SelectField, TextField } from "@/components/admin/FormFields";
import type { FormState } from "@/lib/title-form";
import { MAX_LABEL_LENGTH, type VideoSourceValues } from "@/lib/video-source";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * Adds a video source, or edits one. The server function checks every
 * field again. `idPrefix` keeps field ids apart, as the edit page has one
 * of these per source plus the one that adds.
 */
export default function VideoSourceForm({
  action,
  initialValues,
  hosts,
  idPrefix,
  submitLabel,
}: {
  action: Action;
  initialValues: VideoSourceValues;
  /** The allowed video hosts (VIDEO_HOSTS), named in the link's hint. */
  hosts: string[];
  idPrefix: string;
  submitLabel: string;
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
    <form ref={formRef} key={state.version ?? 0} action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-label`}
          name="label"
          label="Name"
          hint="The player's server tab, like Server 1."
          defaultValue={values.label}
          error={errors.label}
          maxLength={MAX_LABEL_LENGTH}
        />
        <SelectField
          id={`${idPrefix}-kind`}
          name="kind"
          label="Type"
          defaultValue={values.kind}
          error={errors.kind}
        >
          <option value="auto">Work it out from the link</option>
          <option value="embed">Embed (iframe)</option>
          <option value="hls">HLS stream (.m3u8)</option>
          <option value="file">Video file (.mp4, .webm)</option>
        </SelectField>
        <TextField
          id={`${idPrefix}-url`}
          name="url"
          label="Link or embed code"
          hint={
            hosts.length > 0
              ? `An https link, or the provider's <iframe> code. Allowed hosts: ${hosts.join(", ")}.`
              : "No video hosts are allowed yet: add them to VIDEO_HOSTS (docs/DEPLOYMENT.md)."
          }
          defaultValue={values.url}
          error={errors.url}
          maxLength={4000}
          autoComplete="off"
          spellCheck={false}
          className="sm:col-span-2"
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
