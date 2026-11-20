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

import { getSession, getVerifiedSession, requireAdmin, requireUser } from "@/lib/session";

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
});
