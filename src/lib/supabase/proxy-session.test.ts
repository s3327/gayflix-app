import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options: Record<string, unknown> }[],
    headers: Record<string, string>
  ) => void;
};

const createServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

import { refreshSessionCookies } from "@/lib/supabase/proxy-session";
import { proxy } from "@/proxy";

const OLD_TOKEN = "base64-old";
const NEW_TOKEN = "base64-new";

/**
 * A Supabase client whose getClaims() finds the access token expired and
 * refreshes it, as the real one does: it writes the new session through
 * the cookie methods' setAll, with the no-cache headers.
 */
function refreshingClient() {
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieMethods }) => ({
      auth: {
        getClaims: vi.fn(async () => {
          expect(options.cookies.getAll()).toContainEqual({
            name: "sb-127-auth-token",
            value: OLD_TOKEN,
          });
          options.cookies.setAll(
            [
              {
                name: "sb-127-auth-token",
                value: NEW_TOKEN,
                options: { path: "/", sameSite: "lax", httpOnly: false, maxAge: 34560000 },
              },
            ],
            { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" }
          );
          return { data: { claims: { sub: "u1" } }, error: null };
        }),
      },
    })
  );
}

function pageRequest(path = "/home", cookie = `sb-127-auth-token=${OLD_TOKEN}; theme=dark`) {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: { cookie } });
}

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  createServerClient.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("ADMIN_BASIC_AUTH_USER", "");
  vi.stubEnv("ADMIN_BASIC_AUTH_PASSWORD", "");
});

describe("refreshSessionCookies", () => {
  it("puts refreshed session cookies on the response, and on the request for this render", async () => {
    refreshingClient();
    const request = pageRequest();
    const response = NextResponse.next();

    await refreshSessionCookies(request, response);

    expect(createServerClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54421",
      "sb_publishable_test",
      expect.anything()
    );
    expect(response.cookies.get("sb-127-auth-token")?.value).toBe(NEW_TOKEN);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(request.cookies.get("sb-127-auth-token")?.value).toBe(NEW_TOKEN);
    expect(request.cookies.get("theme")?.value).toBe("dark");
  });

  it("does nothing for a guest with no Supabase cookies", async () => {
    const request = pageRequest("/home", "theme=dark");
    const response = NextResponse.next();

    await refreshSessionCookies(request, response);

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

/** A JWT the fake Auth server below accepts (HS256, so getClaims asks /user). */
function fakeJwt(payload: Record<string, unknown>) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.c2ln`;
}

/**
 * The real @supabase/ssr client against a fake Auth server: the cookie's
 * session has expired, so getClaims() refreshes it and the library
 * writes the new cookie with the options we gave it.
 */
async function realClientWithFakeAuth() {
  const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
  const now = Math.floor(Date.now() / 1000);
  const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "m@gayflix.test" };
  const accessToken = fakeJwt({ sub: "u1", exp: now + 3600, aal: "aal1", session_id: "s1" });
  const fakeFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("grant_type=refresh_token")
      ? { access_token: accessToken, refresh_token: "refresh-2", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user }
      : user;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  createServerClient.mockImplementation((url: string, key: string, options: object) =>
    actual.createServerClient(url, key, { ...options, global: { fetch: fakeFetch } } as never)
  );
  const expired = {
    access_token: fakeJwt({ sub: "u1", exp: now - 60 }),
    refresh_token: "refresh-1",
    expires_in: 3600,
    expires_at: now - 60,
    token_type: "bearer",
    user,
  };
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`;
}

describe("session cookie attributes", () => {
  it("are HttpOnly, SameSite=Lax and Path=/, and not Secure on local http", async () => {
    const cookie = await realClientWithFakeAuth();
    const response = NextResponse.next();
    await refreshSessionCookies(pageRequest("/home", cookie), response);

    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith("sb-127-auth-token="));
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/; HttpOnly/i);
    expect(setCookie).toMatch(/; SameSite=Lax/i);
    expect(setCookie).toMatch(/; Path=\//i);
    expect(setCookie).not.toMatch(/; Secure/i);
  });

  it("are Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const cookie = await realClientWithFakeAuth();
    const response = NextResponse.next();
    await refreshSessionCookies(pageRequest("/home", cookie), response);

    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith("sb-127-auth-token="));
    expect(setCookie).toMatch(/; Secure/i);
    expect(setCookie).toMatch(/; HttpOnly/i);
  });

  it("are Secure on an https request", async () => {
    const cookie = await realClientWithFakeAuth();
    const response = NextResponse.next();
    const request = new NextRequest("https://gayflix.test/home", { headers: { cookie } });
    await refreshSessionCookies(request, response);

    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith("sb-127-auth-token="));
    expect(setCookie).toMatch(/; Secure/i);
  });
});

describe("proxy", () => {
  it("sends refreshed cookies to the browser and to the page it renders", async () => {
    refreshingClient();
    const response = await proxy(pageRequest());

    expect(response.cookies.get("sb-127-auth-token")?.value).toBe(NEW_TOKEN);
    // What the page's server components will read as the request's cookies.
    const forwarded = response.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwarded).toContain(`sb-127-auth-token=${NEW_TOKEN}`);
    expect(forwarded).not.toContain(OLD_TOKEN);
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
    expect(response.headers.get("Content-Security-Policy")).toContain("nonce-");
  });

  it("leaves a guest's response without Set-Cookie", async () => {
    const response = await proxy(pageRequest("/home", ""));
    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain("nonce-");
  });
});
