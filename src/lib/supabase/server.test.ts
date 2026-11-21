import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabase, googleSignInEnabled } from "@/lib/supabase/server";

const createServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => requestHeaders,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function settings(google: boolean) {
  return new Response(JSON.stringify({ external: { email: true, google } }), { status: 200 });
}

describe("googleSignInEnabled", () => {
  it("follows Supabase Auth's settings", async () => {
    fetchMock.mockResolvedValueOnce(settings(true));
    await expect(googleSignInEnabled()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54421/auth/v1/settings",
      expect.objectContaining({ headers: { apikey: "sb_publishable_test" } })
    );

    fetchMock.mockResolvedValueOnce(settings(false));
    await expect(googleSignInEnabled()).resolves.toBe(false);
  });

  it("is false when Auth can't be reached or answers with an error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(googleSignInEnabled()).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(googleSignInEnabled()).resolves.toBe(false);
  });
});

describe("createServerSupabase", () => {
  const forwarded = async () => {
    createServerClient.mockReset();
    await createServerSupabase();
    return (createServerClient.mock.calls[0][2] as { global?: { headers?: Record<string, string> } }).global?.headers;
  };

  it("forwards the visitor's browser, so new sessions record it rather than this server's", async () => {
    requestHeaders = new Headers({
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1",
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "203.0.113.7",
    });
    // Never the address.
    expect(await forwarded()).toEqual({
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1",
    });
  });

  it("forwards nothing when the browser sent no user agent", async () => {
    requestHeaders = new Headers();
    expect(await forwarded()).toEqual({});
  });
});
