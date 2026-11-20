import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleSignInEnabled } from "@/lib/supabase/server";

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
