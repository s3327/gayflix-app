import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import {
  errorReportingOptions,
  errorReportingOrigin,
  scrubBreadcrumb,
  scrubEvent,
} from "@/lib/error-reporting";

const DSN = "https://public-key@o123.ingest.us.sentry.io/456";

describe("errorReportingOptions", () => {
  it("collects no personal data", () => {
    expect(errorReportingOptions(DSN).dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
  });
});

describe("errorReportingOrigin", () => {
  it("is the DSN's origin, without its key", () => {
    expect(errorReportingOrigin(DSN)).toBe("https://o123.ingest.us.sentry.io");
  });

  it("is undefined when reports are off or the DSN isn't a URL", () => {
    expect(errorReportingOrigin("")).toBeUndefined();
    expect(errorReportingOrigin("not a dsn")).toBeUndefined();
  });
});

describe("scrubbing", () => {
  it("drops query strings from the page address and the request path", () => {
    const event = scrubEvent({
      type: undefined,
      request: { url: "https://gayflix.example/reset-password?token=secret#top" },
      contexts: { nextjs: { request_path: "/search?q=secret" } },
    } as ErrorEvent);
    expect(event.request?.url).toBe("https://gayflix.example/reset-password");
    expect(event.contexts?.nextjs?.request_path).toBe("/search");
  });

  it("drops query strings from breadcrumbs", () => {
    expect(
      scrubBreadcrumb({ category: "fetch", data: { url: "/api/search?q=secret", method: "GET" } }).data
    ).toEqual({ url: "/api/search", method: "GET" });
    expect(
      scrubBreadcrumb({ category: "navigation", data: { from: "/home?a=1", to: "/reset-password?token=secret" } })
        .data
    ).toEqual({ from: "/home", to: "/reset-password" });
  });
});
