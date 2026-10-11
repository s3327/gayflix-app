import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";

describe("buildContentSecurityPolicy", () => {
  it("only allows scripts carrying the request's nonce in production", () => {
    const csp = buildContentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("adds eval and websockets only in development", () => {
    const csp = buildContentSecurityPolicy("abc123", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });

  it("lets the browser send crash reports when they're on", () => {
    expect(buildContentSecurityPolicy("abc123", false)).toContain("connect-src 'self';");
    expect(buildContentSecurityPolicy("abc123", false, "https://o1.ingest.sentry.io")).toContain(
      "connect-src 'self' https://o1.ingest.sentry.io;"
    );
  });
});

describe("createNonce", () => {
  it("is unique per call", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
  });
});
