import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // No request scope in tests: call straight through.
  cache: <T,>(fn: T) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: getSessionMock } } }));

const { requireUser } = await import("@/lib/session");

describe("requireUser", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockClear();
  });

  it("reads the session from the database, not the cookie cache", async () => {
    const session = { user: { id: "u1", twoFactorEnabled: false } };
    getSessionMock.mockResolvedValue(session);
    await expect(requireUser("/account/setting")).resolves.toBe(session);
    expect(getSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } })
    );
  });

  it("sends a signed-out or banned account to /login, back to where it was", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireUser("/account/setting")).rejects.toThrow(
      "redirect:/login?next=%2Faccount%2Fsetting"
    );
  });
});
