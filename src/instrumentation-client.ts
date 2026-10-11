import { init } from "@sentry/nextjs";
import { errorReportingOptions } from "@/lib/error-reporting";

// Runs in the browser before the app starts: crash reports, when they're
// configured (src/lib/error-reporting.ts). The DSN is fixed at build
// time, so without one this block, and Sentry's code with it, is left
// out of the site's JavaScript.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  init({
    ...errorReportingOptions(process.env.NEXT_PUBLIC_SENTRY_DSN),
    // Crashes only: Sentry otherwise reports every page view as a
    // "session", so every visitor's browser would contact Sentry.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserSession"),
  });
}
