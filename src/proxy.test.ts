import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

const ADMIN = "http://gayflix.test/admin/dashboard";

describe("proxy: content security policy", () => {
  it("sets a nonce-based CSP on the response and the request", async () => {
    const response = await proxy(request("http://gayflix.test/home"));
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    // Next.js reads the nonce from the forwarded request headers.
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("passes the requested path on for server layouts", async () => {
    const response = await proxy(request("http://gayflix.test/account/history?page=2"));
    expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/account/history?page=2");
  });

  it("uses a different nonce for every request", async () => {
    const a = (await proxy(request("http://gayflix.test/home"))).headers.get("content-security-policy");
    const b = (await proxy(request("http://gayflix.test/home"))).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });

  it("doesn't touch public pages' caching or indexing", async () => {
    const response = await proxy(request("http://gayflix.test/administrators"));
    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(response.headers.get("cache-control")).toBeNull();
  });
});

describe("proxy (admin gate at /admin)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("asks for credentials when they're configured", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = await proxy(request(ADMIN));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("rejects wrong credentials", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = await proxy(request(ADMIN, { authorization: `Basic ${btoa("admin:nope")}` }));
    expect(response.status).toBe(401);
  });

  it("lets the right credentials through, marked noindex and uncached", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "secret");
    const response = await proxy(request(ADMIN, { authorization: `Basic ${btoa("admin:secret")}` }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("disables the panel when only one credential is set", async () => {
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "admin");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    expect((await proxy(request(ADMIN))).status).toBe(503);
  });

  it("has no gate when neither credential is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_BASIC_AUTH_USER", "");
    vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
    expect((await proxy(request(ADMIN))).headers.get("x-middleware-next")).toBe("1");
  });
});
