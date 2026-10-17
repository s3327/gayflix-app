/**
 * Validates a post-login `?next=` destination. Only same-site paths are
 * allowed — anything else (absolute URLs, protocol-relative `//evil.com`,
 * backslash tricks browsers normalize into `//`) falls back, so the login
 * page can't be used as an open redirect.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Control characters (tabs/newlines are stripped by URL parsers, which
  // can turn "/\t/evil.com" into "//evil.com").
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}

/** A page's `?next=` search param when it's a path on this site, else null. */
export function nextParam(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" ? safeNextPath(raw, "") || null : null;
}

/**
 * Validates a post-login destination for the admin panel. Only paths
 * starting with `/admin` are allowed (and `/admin/login` itself is rejected),
 * falling back to `/admin/dashboard`.
 */
export function safeAdminNextPath(raw: string | null | undefined, fallback = "/admin/dashboard"): string {
  const path = safeNextPath(raw, fallback);
  if (!path.startsWith("/admin") || path.startsWith("/admin/login")) return fallback;
  return path;
}

/**
 * A link to the log-in or sign-up page that comes back to `next` (a path
 * on this site, query string included) once the visitor is signed in.
 * Every way in carries it on: log in and sign up link to each other with
 * it, and sign-up hands it to the email check.
 */
export function authHref(page: "/login" | "/signup", next?: string | null): string {
  return next ? `${page}?${new URLSearchParams({ next })}` : page;
}
