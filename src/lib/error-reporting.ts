import type { Breadcrumb, BrowserOptions, ErrorEvent } from "@sentry/nextjs";

/**
 * Crash reports, sent to Sentry when NEXT_PUBLIC_SENTRY_DSN is set at
 * build time; with it unset, nothing is set up and nothing is sent.
 * src/instrumentation.ts turns them on for the server,
 * src/instrumentation-client.ts for the browser, and the error pages
 * (src/app/error.tsx, global-error.tsx) report what they catch.
 *
 * A report carries the error and where in the code it happened, the
 * page's address without its query string, and the browser and system.
 * Never a visitor's IP address, cookies, request headers or form
 * fields, the query string (password-reset links carry their token
 * there), or the values in the code's variables. Sentry's defaults
 * collect all of those, hence `dataCollection`. Nothing is sent until
 * something breaks: page views ("sessions") aren't reported.
 */
export function errorReportingOptions(dsn: string): BrowserOptions {
  return {
    dsn,
    // Vercel sets this (on by default); reports then say which deploy.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/**
 * Where browsers send reports (the DSN's origin), for the
 * Content-Security-Policy's connect-src. Undefined when reports are off.
 */
export function errorReportingOrigin(dsn = process.env.NEXT_PUBLIC_SENTRY_DSN) {
  if (!dsn) return undefined;
  try {
    return new URL(dsn).origin;
  } catch {
    return undefined;
  }
}

/** `url` without its query string or #fragment. */
function withoutQuery(url: string) {
  return url.split(/[?#]/, 1)[0];
}

// `dataCollection` keeps query strings out of the server's reports, but
// not out of the page address the browser adds, the request path Next.js
// adds, or the addresses in breadcrumbs (fetches, navigations).
export function scrubEvent(event: ErrorEvent) {
  if (event.request?.url) event.request.url = withoutQuery(event.request.url);
  const nextjs = event.contexts?.nextjs;
  if (typeof nextjs?.request_path === "string") nextjs.request_path = withoutQuery(nextjs.request_path);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb) {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = withoutQuery(data[key]);
    }
  }
  return breadcrumb;
}
