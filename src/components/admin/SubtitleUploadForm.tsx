"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BUTTON_PRIMARY, FormMessage, SelectField, TextField } from "@/components/admin/FormFields";
import type { FormState } from "@/lib/title-form";
import { MAX_SUBTITLE_BYTES, SUBTITLE_ACCEPT, SUBTITLE_SIZE_PROBLEM } from "@/lib/subtitles";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * Uploads one language's subtitles (uploadSubtitle in
 * src/lib/admin-subtitle-actions.ts). The browser checks the size first,
 * since a too-big file wouldn't reach the server; the server checks the
 * size and the file again.
 */
export default function SubtitleUploadForm({
  action,
  languages,
  idPrefix,
}: {
  action: Action;
  /** Code and name, A to Z; those with subtitles already say so. */
  languages: { code: string; name: string; replaces: boolean }[];
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [sizeError, setSizeError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.errors ?? {};

  // A reply with problems: start at the first field to fix.
  useEffect(() => {
    if (state.errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    // A new key after each reply starts the fields over.
    <form
      ref={formRef}
      key={state.version ?? 0}
      action={formAction}
      onSubmit={(event) => {
        const file = new FormData(event.currentTarget).get("file");
        if (file instanceof File && file.size > MAX_SUBTITLE_BYTES) {
          event.preventDefault();
          setSizeError(SUBTITLE_SIZE_PROBLEM);
        }
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id={`${idPrefix}-language`}
          name="language"
          label="Language"
          defaultValue={state.values?.language ?? ""}
          error={errors.language}
          required
        >
          <option value="" disabled>
            Choose a language
          </option>
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.replaces ? `${language.name} (replaces the current file)` : language.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`${idPrefix}-file`}
          name="file"
          type="file"
          label="File"
          hint="A SubRip (.srt) or WebVTT (.vtt) file, up to 500 KB."
          accept={SUBTITLE_ACCEPT}
          error={sizeError ?? errors.file}
          onChange={() => setSizeError(undefined)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Uploading…" : "Upload subtitles"}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
