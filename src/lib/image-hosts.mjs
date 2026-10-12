/**
 * Where posters and backdrops may come from. next/image only serves
 * images from these hosts (next.config.mjs), and the admin title editor
 * only accepts image links on them (src/lib/title-form.ts).
 *
 * The placeholder photos used by the sample catalog are always allowed,
 * and so is the site's own Vercel Blob store, where uploaded images go
 * (see uploadHost). IMAGE_HOSTS adds more: hostnames separated by commas,
 * e.g. "image.tmdb.org,cdn.example.com". They're read when the site is
 * built, so redeploy after changing them.
 */
const SAMPLE_HOSTS = ["picsum.photos", "fastly.picsum.photos"];

/**
 * @param {Record<string, string | undefined>} env the settings to read
 * @returns {string[]}
 */
export function imageHosts(env = process.env) {
  const hosts = (env.IMAGE_HOSTS ?? "")
    .split(",")
    .map((entry) => hostnameOf(entry.trim().toLowerCase()))
    .filter((host) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host));
  const upload = uploadHost(env);
  return [...new Set([...SAMPLE_HOSTS, ...(upload ? [upload] : []), ...hosts])];
}

/**
 * Where uploaded posters and backdrops are kept: the host of the Vercel
 * Blob store connected to the project, or undefined when there's none
 * (uploads are then off). Connecting a store sets BLOB_READ_WRITE_TOKEN,
 * "vercel_blob_rw_<store id>_<secret>", or BLOB_STORE_ID; the store's
 * files are at https://<store id>.public.blob.vercel-storage.com/.
 *
 * @param {Record<string, string | undefined>} env the settings to read
 * @returns {string | undefined}
 */
export function uploadHost(env = process.env) {
  const storeId =
    env.BLOB_STORE_ID?.trim().replace(/^store_/, "") || env.BLOB_READ_WRITE_TOKEN?.trim().split("_")[3];
  if (!storeId || !/^[a-z0-9]+$/i.test(storeId)) return undefined;
  return `${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
}

/** "https://cdn.example.com/posters" is taken to mean cdn.example.com. */
function hostnameOf(entry) {
  if (!entry.includes("://")) return entry;
  try {
    return new URL(entry).hostname;
  } catch {
    return "";
  }
}
