"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { BUTTON_PRIMARY, FormMessage, SelectField, TextField } from "@/components/admin/FormFields";
import { verifyVideoUrl } from "@/lib/admin-catalog-actions";
import type { FormState } from "@/lib/title-form";
import { MAX_LABEL_LENGTH, type VideoSourceValues } from "@/lib/video-source";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * Adds a video source, or edits one. Includes inline stream health probe ("Verify Link").
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

  const [verifyStatus, setVerifyStatus] = useState<{
    state: "idle" | "checking" | "ok" | "failed";
    message?: string;
  }>({ state: "idle" });
  const [isVerifying, startTransition] = useTransition();

  // A reply with problems: start at the first field to fix.
  useEffect(() => {
    if (state.errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const handleVerify = () => {
    const urlInput = formRef.current?.querySelector<HTMLInputElement>(`#${idPrefix}-url`);
    const rawUrl = urlInput?.value?.trim();
    if (!rawUrl) {
      setVerifyStatus({ state: "failed", message: "Enter a URL first." });
      return;
    }

    setVerifyStatus({ state: "checking" });
    startTransition(async () => {
      // Extract URL if iframe code was pasted
      const iframeMatch = rawUrl.match(/src=["']([^"']+)["']/i);
      const testUrl = iframeMatch ? iframeMatch[1] : rawUrl;

      const res = await verifyVideoUrl(testUrl);
      if (res.ok) {
        setVerifyStatus({
          state: "ok",
          message: `Link reachable${res.status ? ` (${res.status} OK)` : ""}`,
        });
      } else {
        setVerifyStatus({
          state: "failed",
          message: res.error || (res.status ? `Status ${res.status}` : "Unreachable"),
        });
      }
    });
  };

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
        <div className="sm:col-span-2 space-y-2">
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
          />

          {/* Stream Health Verification */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isVerifying}
              onClick={handleVerify}
              className="rounded-card border border-border-strong px-2.5 py-1 text-2xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary flex items-center gap-1 disabled:opacity-60"
            >
              {isVerifying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3 text-brand-pink" />
              )}
              Verify Link
            </button>

            {verifyStatus.state === "ok" && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-status-success">
                <Check className="h-3 w-3" />
                {verifyStatus.message}
              </span>
            )}
            {verifyStatus.state === "failed" && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-status-error">
                <AlertCircle className="h-3 w-3" />
                {verifyStatus.message}
              </span>
            )}
          </div>
        </div>
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
