/*
 * Poster and backdrop uploads: which files the admin title editor takes.
 * The browser checks the size before sending one
 * (src/components/admin/ImageField.tsx); the server checks the size and
 * the type again (src/lib/admin-image-actions.ts).
 */

/** 4 MB: requests to a site on Vercel can't be over 4.5 MB. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** The image types taken, with the file extension each is stored under. */
export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

/** For the file picker's `accept`. */
export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).join(",");

export const IMAGE_TYPE_PROBLEM = "Upload a JPEG, PNG, WebP or AVIF image.";
export const IMAGE_SIZE_PROBLEM = "That image is over 4 MB. Upload a smaller one.";

/**
 * What kind of image `bytes` are, read from the bytes themselves rather
 * than the file's name or the type the browser reports. Undefined for
 * anything else, SVG included: it can carry scripts.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | undefined {
  const has = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  const text = (offset: number, ascii: string) => has(offset, ...[...ascii].map((c) => c.charCodeAt(0)));

  if (has(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (has(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (text(0, "RIFF") && text(8, "WEBP")) return "image/webp";
  // AVIF starts with an "ftyp" box listing its brands: the main one at
  // byte 8, then others from byte 16 to the box's end.
  if (text(4, "ftyp")) {
    const boxEnd = Math.min(((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0, bytes.length);
    for (let offset = 8; offset + 4 <= boxEnd; offset += offset === 8 ? 8 : 4) {
      if (text(offset, "avif") || text(offset, "avis")) return "image/avif";
    }
  }
  return undefined;
}
