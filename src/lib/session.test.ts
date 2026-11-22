import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const readAuthProfile = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getClaims } }),
}));
vi.mock("@/lib/auth-profile", () => ({
  readAuthProfile: (userId: string, sessionId: string) => readAuthProfile(userId, sessionId),
}));
let requestCookies = [{ name: "sb-127-auth-token", value: "base64-token" }];
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/admin/dashboard" }),
  cookies: async () => ({ getAll: () => requestCookies }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import {
  getPendingTwoFactorSession,
  getSession,
  getVerifiedSession,
  requireAdmin,
  requireUser,
} from "@/lib/session";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";
const nowSeconds = Math.floor(Date.now() / 1000);

/** Claims as Supabase Auth issues them (checked against the local stack). */
function claims(extra: Record<string, unknown> = {}) {
  return {
    iss: "http://127.0.0.1:54421/auth/v1",
    sub: USER_ID,
    aud: "authenticated",
    exp: nowSeconds + 3600,
    iat: nowSeconds,
    email: "member@gayflix.test",
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: nowSeconds - 600 }],
    session_id: "22222222-2222-2222-2222-222222222222",
    user_metadata: { name: "Sam" },
    ...extra,
  };
}

/** A staff member who signed in with password, then TOTP, a minute ago. */
function adminClaims(extra: Record<string, unknown> = {}) {
  return claims({
    aal: "aal2",
    amr: [
      { method: "totp", timestamp: nowSeconds - 60 },
      { method: "password", timestamp: nowSeconds - 120 },
    ],
    user_role: "admin",
    ...extra,
  });
}

beforeEach(() => {
  requestCookies = [{ name: "sb-127-auth-token", value: "base64-token" }];
  getClaims.mockReset();
  readAuthProfile.mockReset();
});

describe("getSession", () => {
  it("is null for a guest, without asking Supabase", async () => {
    requestCookies = [{ name: "theme", value: "dark" }];
    expect(await getSession()).toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("is null when the cookie holds no session", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await getSession()).toBeNull();
  });

  it("is null when the token doesn't verify", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("Invalid JWT signature") });
    expect(await getSession()).toBeNull();
  });

  it("reads the user, role and two-factor times from the claims, without the database", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims() }, error: null });
    expect(await getSession()).toEqual({
      user: { id: USER_ID, email: "member@gayflix.test", role: "admin", name: "Sam" },
      sessionId: "22222222-2222-2222-2222-222222222222",
      aal: "aal2",
      totpVerifiedAt: (nowSeconds - 60) * 1000,
      createdAt: (nowSeconds - 120) * 1000,
      hasVerifiedTotp: false,
    });
    expect(readAuthProfile).not.toHaveBeenCalled();
  });

  it("defaults the role to user and the name to null", async () => {
    getClaims.mockResolvedValue({
      data: { claims: claims({ user_metadata: {} }) },
      error: null,
    });
    const session = await getSession();
    expect(session?.user.role).toBe("user");
    expect(session?.user.name).toBeNull();
    expect(session?.totpVerifiedAt).toBeNull();
    expect(session?.createdAt).toBe((nowSeconds - 600) * 1000);
  });

  it("treats a session with no sign-in times as already expired for admin checks", async () => {
    getClaims.mockResolvedValue({ data: { claims: claims({ amr: ["password"] }) }, error: null });
    expect((await getSession())?.createdAt).toBe(0);
  });
});

describe("getVerifiedSession", () => {
  it("takes the role from the profile row, not the token", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims() }, error: null });
    readAuthProfile.mockResolvedValue({ role: "user", hasVerifiedTotp: true });
    const session = await getVerifiedSession();
    expect(readAuthProfile).toHaveBeenCalledWith(USER_ID, SESSION_ID);
    expect(session?.user.role).toBe("user");
    expect(session?.hasVerifiedTotp).toBe(true);
  });

  it("is the session when the database says it's live", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims() }, error: null });
    readAuthProfile.mockResolvedValue({ role: "admin", hasVerifiedTotp: true });
    const session = await getVerifiedSession();
    expect(session?.user.id).toBe(USER_ID);
    expect(session?.sessionId).toBe(SESSION_ID);
  });

  // readAuthProfile finds no row for a revoked session, a banned account
  // or a missing profile (its SQL: src/lib/auth-profile.integration.test.ts),
  // though the token itself still verifies until it expires.
  for (const why of ["the session was revoked", "the account is banned", "there's no profile row"]) {
    it(`is null when ${why}`, async () => {
      getClaims.mockResolvedValue({ data: { claims: adminClaims() }, error: null });
      readAuthProfile.mockResolvedValue(null);
      expect(await getVerifiedSession()).toBeNull();
    });
  }

  it("never asks the database about a token without a session id", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims({ session_id: undefined }) }, error: null });
    expect(await getVerifiedSession()).toBeNull();
    expect(readAuthProfile).not.toHaveBeenCalled();
  });
});

// A password-only (aal1) session of an account with two-factor is
// waiting for its code (signIn keeps it for that step): until then it
// counts as signed out everywhere but verifyTwoFactor.
describe("a sign-in waiting for its two-factor code", () => {
  const pending = () => claims({ has_totp: true });

  it("is signed out for getSession and requireUser", async () => {
    getClaims.mockResolvedValue({ data: { claims: pending() }, error: null });
    readAuthProfile.mockResolvedValue({ role: "user", hasVerifiedTotp: true });
    expect(await getSession()).toBeNull();
    await expect(requireUser("/account")).rejects.toThrow("NEXT_REDIRECT /login?next=%2Faccount");
  });

  it("is signed in once it passed two-factor (aal2)", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims({ has_totp: true }) }, error: null });
    readAuthProfile.mockResolvedValue({ role: "admin", hasVerifiedTotp: true });
    expect((await getSession())?.aal).toBe("aal2");
    expect((await requireUser("/account")).user.id).toBe(USER_ID);
  });

  it("is signed in when the account has no two-factor", async () => {
    getClaims.mockResolvedValue({ data: { claims: claims({ has_totp: false }) }, error: null });
    expect(await getSession()).not.toBeNull();
  });

  it("is what getPendingTwoFactorSession returns, and nothing else is", async () => {
    getClaims.mockResolvedValue({ data: { claims: pending() }, error: null });
    expect(await getPendingTwoFactorSession()).toMatchObject({ user: { id: USER_ID }, aal: "aal1" });
  });

  for (const [what, tokenClaims] of [
    ["an aal2 session", () => adminClaims({ has_totp: true })],
    ["a session without two-factor", () => claims({ has_totp: false })],
  ] as const) {
    it(`isn't ${what}`, async () => {
      getClaims.mockResolvedValue({ data: { claims: tokenClaims() }, error: null });
      expect(await getPendingTwoFactorSession()).toBeNull();
    });
  }

  it("is refused by getVerifiedSession from the database's word, even when the token predates the factor", async () => {
    getClaims.mockResolvedValue({ data: { claims: claims({ user_role: "admin" }) }, error: null });
    readAuthProfile.mockResolvedValue({ role: "admin", hasVerifiedTotp: true });
    expect(await getVerifiedSession()).toBeNull();
  });

  it("doesn't stop getVerifiedSession when the database says the factor is gone", async () => {
    getClaims.mockResolvedValue({ data: { claims: pending() }, error: null });
    readAuthProfile.mockResolvedValue({ role: "user", hasVerifiedTotp: false });
    expect(await getVerifiedSession()).not.toBeNull();
  });
});

describe("requireAdmin", () => {
  it("lets in an admin per the profile row", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims() }, error: null });
    readAuthProfile.mockResolvedValue({ role: "admin", hasVerifiedTotp: true });
    const session = await requireAdmin();
    expect(session.user.role).toBe("admin");
  });

  it("refuses a demoted admin whose token still says admin", async () => {
    getClaims.mockResolvedValue({ data: { claims: adminClaims() }, error: null });
    readAuthProfile.mockResolvedValue({ role: "user", hasVerifiedTotp: true });
    await expect(requireAdmin()).rejects.toThrow(
      "NEXT_REDIRECT /admin/login?next=%2Fadmin%2Fdashboard"
    );
  });
});

describe("requireUser", () => {
  it("sends a guest to /login with a way back", async () => {
    requestCookies = [];
    await expect(requireUser("/account")).rejects.toThrow("NEXT_REDIRECT /login?next=%2Faccount");
  });

  it("reads the session fresh from the database, so the page shows its current role and two-factor", async () => {
    getClaims.mockResolvedValue({ data: { claims: claims({ user_role: "admin" }) }, error: null });
    readAuthProfile.mockResolvedValue({ role: "user", hasVerifiedTotp: false });
    const session = await requireUser("/account/setting");
    expect(readAuthProfile).toHaveBeenCalledWith(USER_ID, SESSION_ID);
    expect(session.user.role).toBe("user");
  });

  it("sends a signed-out or banned account to /login at once, though its token still verifies", async () => {
    getClaims.mockResolvedValue({ data: { claims: claims() }, error: null });
    readAuthProfile.mockResolvedValue(null);
    await expect(requireUser("/account/setting")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2Faccount%2Fsetting"
    );
  });
});
