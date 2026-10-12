"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { BUTTON_SECONDARY, TextField } from "@/components/admin/FormFields";
import { uploadTitleImage, type UploadResult } from "@/lib/admin-image-actions";
import { IMAGE_ACCEPT, IMAGE_SIZE_PROBLEM, MAX_IMAGE_BYTES } from "@/lib/image-upload";

type Upload =
  | { state: "idle" }
  | { state: "uploading" }
  | { state: "done"; preview: string }
  | { state: "failed"; message: string };

/**
 * A poster or backdrop: a link to the image, which an Upload button can
 * fill in when the site has a Blob store to keep images in
 * (src/lib/admin-image-actions.ts). The file is uploaded as soon as it's
 * picked; the form only sends the link.
 */
export default function ImageField({
  kind,
  label,
  hint,
  optional,
  defaultValue,
  error,
  canUpload,
  className = "",
}: {
  kind: "poster" | "backdrop";
  label: string;
  hint: string;
  optional?: boolean;
  defaultValue: string;
  error?: string;
  canUpload: boolean;
  className?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = upload.state === "done" ? upload.preview : undefined;

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Picking the same file again should upload it again.
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
      result = await uploadTitleImage(form);
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

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
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
      {canUpload && (
        <div className="flex flex-wrap items-center gap-3">
          {/* No name: the file isn't sent with the form, only its link. */}
          <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={send} />
          <button
            type="button"
            disabled={upload.state === "uploading"}
            onClick={() => fileInput.current?.click()}
            className={`${BUTTON_SECONDARY} disabled:opacity-60`}
          >
            {kind === "poster" ? "Upload a poster" : "Upload a backdrop"}
          </button>
          {preview && (
            // The picked file itself (a blob: URL); next/image can't optimize it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className={`h-16 rounded-sm object-cover ${kind === "poster" ? "w-11" : "w-28"}`}
            />
          )}
          {(upload.state === "uploading" || upload.state === "done") && (
            <p role="status" className="text-sm text-ink-secondary">
              {upload.state === "uploading" ? "Uploading…" : "Uploaded. Save to use it."}
            </p>
          )}
          {upload.state === "failed" && (
            <p role="alert" className="text-sm font-medium text-status-error">
              {upload.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
