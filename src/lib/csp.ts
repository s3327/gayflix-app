/**
 * The site's Content Security Policy, built per request by src/proxy.ts.
 *
 * Scripts must carry this request's nonce. Next.js reads the nonce from
 * the CSP request header and stamps it on its own scripts, and
 * 'strict-dynamic' lets those scripts load the rest of the app's chunks.
 * An injected <script> without the nonce never runs, which matters
 * because the admin panel shares this origin.
 *
 * Styles keep 'unsafe-inline': React and next/image write inline `style`
 * attributes, which nonces can't cover, and style injection is far less
 * dangerous than script injection.
 *
 * - `dev` adds what development needs: eval and hot reload's websockets.
 * - `reportOrigin` is where the browser sends crash reports, when they're
 *   on (errorReportingOrigin() in src/lib/error-reporting.ts).
 * - `videoSources` are the video hosts (videoHostSources() in
 *   src/lib/video-hosts.ts): embeds load in frames from them, video files
 *   play from them, and HLS players fetch playlists and segments from
 *   them. Without any, nothing may be framed.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  {
    dev = false,
    reportOrigin,
    videoSources = [],
  }: { dev?: boolean; reportOrigin?: string; videoSources?: string[] } = {}
): string {
  const video = videoSources.map((source) => ` ${source}`).join("");
  return [
    "default-src 'self'",
    // Dev additionally needs eval (React's dev tooling); prod never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Posters go through next/image (/_next/image on this origin), so no
    // third-party image host needs to be listed here.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Dev also needs websockets for hot reload.
    `connect-src 'self'${reportOrigin ? ` ${reportOrigin}` : ""}${video}${dev ? " ws: wss:" : ""}`,
    `media-src 'self' blob:${video}`,
    // HLS players parse streams in a worker they start from a blob.
    "worker-src 'self' blob:",
    video ? `frame-src${video}` : "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** A fresh, unguessable nonce (base64 of a random UUID). */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
