import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

const ADMIN = "http://gayflix.test/admin/dashboard";

describe("proxy (admin gate at /admin)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("asks for credentials when they're configured", () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = proxy(request(ADMIN));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("rejects wrong credentials", () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = proxy(request(ADMIN, { authorization: `Basic ${btoa("admin:nope")}` }));
    expect(response.status).toBe(401);
  });

  it("lets the right credentials through, marked noindex and uncached", () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = proxy(request(ADMIN, { authorization: `Basic ${btoa("admin:secret")}` }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("disables the panel in production when no credentials are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    expect(proxy(request(ADMIN)).status).toBe(503);
  });

  it("stays open in development when no credentials are set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    expect(proxy(request(ADMIN)).headers.get("x-middleware-next")).toBe("1");
  });
});
