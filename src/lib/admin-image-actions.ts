"use server";

import { put } from "@vercel/blob";
import { imageHosts, uploadHost } from "@/lib/image-hosts.mjs";
import {
  IMAGE_SIZE_PROBLEM,
  IMAGE_TYPE_PROBLEM,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  sniffImageType,
} from "@/lib/image-upload";
import { catalogSession, FORBIDDEN_CATALOG } from "@/lib/admin-guard";
import { imageUrlProblem } from "@/lib/title-form";

export type UploadResult = { url: string; error?: undefined } | { url?: undefined; error: string };

/**
 * The title editor's Upload button (src/components/admin/ImageField.tsx).
 * Keeps a poster or backdrop in the site's Vercel Blob store and returns
 * its address, which goes in the form's image link; the title only uses
 * it once it's saved. Like the editor's other server functions, it checks
 * for an admin itself and checks what it's sent: the file's size, and its
 * type from its bytes.
 *
 * Images are public, as posters are, under a random name. Ones replaced
 * later, or never saved with a title, stay in the store.
 */
export async function uploadTitleImage(form: FormData): Promise<UploadResult> {
  const { allowed } = await catalogSession();
  if (!allowed) return { error: FORBIDDEN_CATALOG };
  const kind = form.get("kind");
  const file = form.get("file");
  if ((kind !== "poster" && kind !== "backdrop") || !(file instanceof Blob)) throw new Error("Invalid upload");
  if (!uploadHost()) return { error: "Uploads aren't set up on this site. Paste a link instead." };
  if (file.size > MAX_IMAGE_BYTES) return { error: IMAGE_SIZE_PROBLEM };

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { error: IMAGE_TYPE_PROBLEM };

  let url: string;
  try {
    ({ url } = await put(`${kind}s/${kind}.${IMAGE_TYPES[type]}`, bytes, {
      access: "public",
      contentType: type,
      addRandomSuffix: true,
    }));
  } catch (error) {
    console.error("[uploads] storing an image failed:", error);
    return { error: "The upload didn't go through. Try again." };
  }
  // The form only takes images it can show (next/image's hosts).
  if (imageUrlProblem(url, imageHosts())) {
    console.error(`[uploads] stored ${url}, which isn't on the store's expected host, ${uploadHost()}`);
    return { error: "The image was stored, but this site can't show it. Paste a link instead." };
  }
  return { url };
}
