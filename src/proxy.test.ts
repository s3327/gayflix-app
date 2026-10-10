import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(url: string, headers: Record<string, string> = {}) {
  const { host } = new URL(url);
  return new NextRequest(url, { headers: { host, ...headers } });
}

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("redirects /admin paths on the public host to the home page", () => {
    const response = proxy(request("http://gayflix.test/admin/dashboard?x=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://gayflix.test/");
  });

  it("leaves public look-alike paths alone", () => {
    const response = proxy(request("http://gayflix.test/administrators"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("asks for credentials on the admin host when they're configured", () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = proxy(request("http://admin.gayflix.test/dashboard"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  it("rewrites into /admin once authenticated, marked noindex", () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = proxy(
      request("http://admin.gayflix.test/dashboard", {
        authorization: `Basic ${btoa("admin:secret")}`,
      })
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://admin.gayflix.test/admin/dashboard"
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("disables the admin host in production when no credentials are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    expect(proxy(request("http://admin.gayflix.test/dashboard")).status).toBe(503);
  });
});
