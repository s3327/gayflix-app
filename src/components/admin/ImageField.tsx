"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { BUTTON_SECONDARY, SelectField, TextField } from "@/components/admin/FormFields";
import type { UploadResult } from "@/lib/admin-image-actions";
import { IMAGE_ACCEPT, IMAGE_SIZE_PROBLEM, MAX_IMAGE_BYTES } from "@/lib/image-upload";

type Upload =
  | { state: "idle" }
  | { state: "uploading" }
  | { state: "done"; preview: string }
  | { state: "failed"; message: string };

/**
 * A poster or backdrop: a link to the image with upload support,
 * in-flight save guard, live pasted-URL preview, and optional focal point.
 */
export default function ImageField({
  kind,
  label,
  hint,
  optional,
  defaultValue,
  defaultFocus = "center",
  error,
  canUpload,
  className = "",
}: {
  kind: "poster" | "backdrop";
  label: string;
  hint: string;
  optional?: boolean;
  defaultValue: string;
  defaultFocus?: string;
  error?: string;
  canUpload: boolean;
  className?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = upload.state === "done" ? upload.preview : undefined;

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Disable form submit buttons while upload is active
  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;
    const submitButtons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');

    if (upload.state === "uploading") {
      submitButtons.forEach((btn) => {
        btn.setAttribute("disabled", "true");
        btn.setAttribute("data-upload-locked", "true");
      });
    } else {
      submitButtons.forEach((btn) => {
        if (btn.getAttribute("data-upload-locked")) {
          btn.removeAttribute("disabled");
          btn.removeAttribute("data-upload-locked");
        }
      });
    }
  }, [upload.state]);

  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setUpload({ state: "failed", message: IMAGE_SIZE_PROBLEM });
      return;
    }
    setUpload({ state: "uploading" });
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    let result: UploadResult;
    try {
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: form });
      result = await res.json();
    } catch {
      result = { error: "The upload didn't go through. Try again." };
    }
    if (result.url === undefined) {
      setUpload({ state: "failed", message: result.error });
    } else {
      setUrl(result.url);
      setUpload({ state: "done", preview: URL.createObjectURL(file) });
    }
  }

  // Determine image preview: either file blob or live pasted URL
  const showLivePastedPreview = !preview && url.trim().startsWith("http");

  return (
    <div ref={containerRef} className={`flex flex-col gap-2 ${className}`}>
      <TextField
        name={`${kind}Url`}
        label={label}
        type="url"
        optional={optional}
        hint={hint}
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          setUpload({ state: "idle" });
        }}
        error={error}
      />

      {kind === "backdrop" && (
        <SelectField
          name="backdropFocus"
          label="Backdrop focal point"
          hint="Optimizes hero framing across mobile and desktop headers."
          defaultValue={defaultFocus}
        >
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </SelectField>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canUpload && (
          <>
            <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={send} />
            <button
              type="button"
              disabled={upload.state === "uploading"}
              onClick={() => fileInput.current?.click()}
              className={`${BUTTON_SECONDARY} disabled:opacity-60`}
            >
              {kind === "poster" ? "Upload a poster" : "Upload a backdrop"}
            </button>
          </>
        )}

        {/* Live preview for upload or pasted URL */}
        {(preview || showLivePastedPreview) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview ?? url.trim()}
            alt=""
            className={`h-16 rounded-sm object-cover border border-border-subtle bg-bg-base ${
              kind === "poster" ? "w-11" : "w-28"
            }`}
          />
        )}

        {(upload.state === "uploading" || upload.state === "done") && (
          <p role="status" className="text-sm text-ink-secondary">
            {upload.state === "uploading" ? "Uploading (saving paused)…" : "Uploaded. Save to use it."}
          </p>
        )}
        {upload.state === "failed" && (
          <p role="alert" className="text-sm font-medium text-status-error">
            {upload.message}
          </p>
        )}
      </div>
    </div>
  );
}
