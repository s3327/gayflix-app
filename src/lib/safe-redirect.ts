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
