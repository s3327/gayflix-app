import { captureRequestError, init } from "@sentry/nextjs";
import { errorReportingOptions } from "@/lib/error-reporting";

/**
 * Next.js runs this once as each server instance starts: it turns on
 * crash reports when they're configured (src/lib/error-reporting.ts).
 */
export function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) init(errorReportingOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
}

/**
 * Next.js calls this with every error thrown while serving a request:
 * pages, server functions, route handlers and src/proxy.ts. With
 * reports off it does nothing.
 */
export const onRequestError = captureRequestError;
