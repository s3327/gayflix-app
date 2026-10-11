/**
 * Where posters and backdrops may come from. next/image only serves
 * images from these hosts (next.config.mjs), and the admin title editor
 * only accepts image links on them (src/lib/title-form.ts).
 *
 * The placeholder photos used by the sample catalog and Continue Watching
 * are always allowed. IMAGE_HOSTS adds more: hostnames separated by
 * commas, e.g. "image.tmdb.org,cdn.example.com". It's read when the site
 * is built, so redeploy after changing it.
 */
const SAMPLE_HOSTS = ["picsum.photos", "fastly.picsum.photos"];

/**
 * @param {string | undefined} extra the IMAGE_HOSTS setting
 * @returns {string[]}
 */
export function imageHosts(extra = process.env.IMAGE_HOSTS) {
  const hosts = (extra ?? "")
    .split(",")
    .map((entry) => hostnameOf(entry.trim().toLowerCase()))
    .filter((host) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host));
  return [...new Set([...SAMPLE_HOSTS, ...hosts])];
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
