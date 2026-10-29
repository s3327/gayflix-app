/**
 * Where movies and episodes may play from. The admin editor only takes
 * video links on these hosts (src/lib/video-source.ts), the watch pages
 * only offer sources on them (getVideoSources in src/lib/catalog.ts), and
 * the Content-Security-Policy lets the browser load them
 * (src/lib/csp.ts).
 *
 * VIDEO_HOSTS lists them: hostnames separated by commas, such as
 * "player.example.com,*.b-cdn.net". "*." allows every subdomain of a
 * host (not the host itself), as video storage often serves each
 * library or stream from its own subdomain. An HLS stream needs the
 * hosts of its playlists and of its segments. Redeploy after changing
 * it. With none, no video can be added.
 */
export const DEFAULT_VIDEO_HOSTS = ["gayflix.my.id"];

export function videoHosts(env: Record<string, string | undefined> = process.env): string[] {
  const hosts = (env.VIDEO_HOSTS ?? "")
    .split(",")
    .map((entry) => hostnameOf(entry.trim().toLowerCase()))
    .filter((host) => /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host));
  return [...new Set([...DEFAULT_VIDEO_HOSTS, ...hosts])];
}

/** Whether `hostname` is one of `hosts`, or a subdomain of a "*." entry. */
export function videoHostAllowed(hostname: string, hosts: string[]): boolean {
  return hosts.some((host) =>
    host.startsWith("*.") ? hostname.endsWith(host.slice(1)) : hostname === host
  );
}

/** Whether a stored link is still on an allowed host. */
export function videoUrlAllowed(url: string, hosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.port && videoHostAllowed(parsed.hostname, hosts);
  } catch {
    return false;
  }
}

/** The hosts as Content-Security-Policy sources: "https://player.example.com". */
export function videoHostSources(hosts: string[]): string[] {
  return hosts.map((host) => `https://${host}`);
}

/** "https://player.example.com/embed" is taken to mean player.example.com. */
function hostnameOf(entry: string): string {
  if (!entry.includes("://")) return entry.replace(/\/.*$/, "");
  try {
    return new URL(entry).hostname;
  } catch {
    return "";
  }
}
