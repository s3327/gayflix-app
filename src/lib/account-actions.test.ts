import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
  getVerifiedSession: () => mockGetSession(),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

// The signed-in devices' actions still use Better Auth (until Task 9).
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));

const mfa = { listFactors: vi.fn(), unenroll: vi.fn() };
const auth = { mfa, refreshSession: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth }),
}));

const mockCheckPassword = vi.fn();
vi.mock("@/lib/supabase/password-check", () => ({
  checkPassword: (...args: unknown[]) => mockCheckPassword(...args),
}));

// The limits, counted in memory (auth-rate-limit.integration.test.ts covers the table).
const attempts = new Map<string, number>();
vi.mock("@/lib/auth-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-rate-limit")>();
  return {
    ...actual,
    overLimit: async (limit: { name: string; max: number }, parts: string[]) => {
      const key = `${limit.name}|${parts.join("|")}`;
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      return attempts.get(key)! > limit.max;
    },
  };
});

import { disableTwoFactorAction } from "@/lib/account-actions";

const FACTOR_ID = "33333333-3333-3333-3333-333333333333";

function session(role = "user") {
  return {
    user: { id: "user_1", email: "user_1@gayflix.test", role, name: null },
    sessionId: "session_1",
    aal: "aal2",
    hasVerifiedTotp: true,
  };
}

describe("disableTwoFactorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attempts.clear();
    delete process.env.ADMIN_REQUIRE_2FA;
    mockGetSession.mockResolvedValue(session());
    mockCheckPassword.mockResolvedValue("ok");
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: FACTOR_ID }], totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }] },
      error: null,
    });
    mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    auth.refreshSession.mockResolvedValue({ data: {}, error: null });
  });

  it("returns an error if the user is not signed in", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await disableTwoFactorAction("my_password");
    expect(result.error).toMatch(/log out and log in again/i);
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("returns an error if the password is empty or not a string", async () => {
    expect((await disableTwoFactorAction("")).error).toMatch(/enter your password/i);
    expect((await disableTwoFactorAction(42)).error).toMatch(/enter your password/i);
    expect(mockCheckPassword).not.toHaveBeenCalled();
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("keeps two-factor on for staff when ADMIN_REQUIRE_2FA is on", async () => {
    process.env.ADMIN_REQUIRE_2FA = "true";
    mockGetSession.mockResolvedValue(session("admin"));
    const result = await disableTwoFactorAction("my_password");
    expect(result).toEqual({ error: "Staff accounts keep two-factor on." });
    expect(mockCheckPassword).not.toHaveBeenCalled();
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("lets staff turn it off when ADMIN_REQUIRE_2FA isn't set", async () => {
    mockGetSession.mockResolvedValue(session("admin"));
    expect(await disableTwoFactorAction("my_password")).toEqual({ success: true });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID });
  });

  it("re-checks the password for the session's own email", async () => {
    await disableTwoFactorAction("correct_password");
    expect(mockCheckPassword).toHaveBeenCalledWith("user_1@gayflix.test", "correct_password");
  });

  it("refuses a wrong password, leaving two-factor on", async () => {
    mockCheckPassword.mockResolvedValue("wrong");
    expect(await disableTwoFactorAction("wrong_password")).toEqual({ error: "That password isn't right." });
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("says so when the password can't be checked", async () => {
    mockCheckPassword.mockResolvedValue("error");
    expect(await disableTwoFactorAction("my_password")).toEqual({
      error: "Something went wrong. Please try again.",
    });
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("allows 5 password checks per account in a window, then refuses without checking", async () => {
    mockCheckPassword.mockResolvedValue("wrong");
    for (let i = 0; i < 5; i++) await disableTwoFactorAction("guess");
    expect(await disableTwoFactorAction("guess")).toEqual({ error: "Too many attempts. Try again later." });
    expect(mockCheckPassword).toHaveBeenCalledTimes(5);
  });

  it("removes every verified TOTP factor, refreshes the session, and the Setting page", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: FACTOR_ID }, { id: "second-factor" }] },
      error: null,
    });
    expect(await disableTwoFactorAction("correct_password")).toEqual({ success: true });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "second-factor" });
    expect(auth.refreshSession).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/account/setting");
  });

  it("says so when Supabase won't remove the factor", async () => {
    mfa.unenroll.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", code: "insufficient_aal", status: 403, message: "AAL2 required" },
    });
    expect(await disableTwoFactorAction("correct_password")).toEqual({
      error: "Something went wrong. Please try again.",
    });
  });
});
