import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /login opens on the two-factor code step (`?twoFactor=1`) only while a
 * sign-in is waiting for its code: after Google sign-in on an account
 * with two-factor (src/app/auth/callback/route.ts), or a reload in the
 * middle of signing in.
 */

const getSession = vi.fn();
const getPendingTwoFactorSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
  getPendingTwoFactorSession: () => getPendingTwoFactorSession(),
}));
vi.mock("@/lib/supabase/server", () => ({ googleSignInEnabled: async () => false }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("./LoginForm", () => ({ default: () => null }));

import LoginPage from "@/app/login/page";

async function render(query: Record<string, string>) {
  const element = (await LoginPage({ searchParams: Promise.resolve(query) })) as { props: Record<string, unknown> };
  return element.props;
}

beforeEach(() => {
  getSession.mockResolvedValue(null);
  getPendingTwoFactorSession.mockResolvedValue(null);
});

describe("/login", () => {
  it("opens on the code step when asked and a sign-in is waiting for its code", async () => {
    getPendingTwoFactorSession.mockResolvedValue({ user: { id: "u1" } });
    expect(await render({ twoFactor: "1", next: "/title/x" })).toMatchObject({
      twoFactor: true,
      next: "/title/x",
    });
  });

  it("shows the password form when nothing is waiting, whatever the link says", async () => {
    expect(await render({ twoFactor: "1" })).toMatchObject({ twoFactor: false });
  });

  it("shows the password form without the flag", async () => {
    getPendingTwoFactorSession.mockResolvedValue({ user: { id: "u1" } });
    expect(await render({})).toMatchObject({ twoFactor: false });
  });

  it("sends a signed-in member on", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    await expect(render({ twoFactor: "1", next: "/title/x" })).rejects.toThrow("NEXT_REDIRECT /title/x");
  });
});
