import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
