import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two-factor (TOTP) with Supabase Auth's MFA API, with the Supabase
 * client and the session readers mocked. What's checked: arguments are
 * validated before Supabase is called, code attempts are limited per
 * account and per client, wrong codes get a readable message, and the
 * session is refreshed once a factor is added (so its token says so).
 */

const mfa = {
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challengeAndVerify: vi.fn(),
};
const auth = { mfa, refreshSession: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth }),
}));

const getVerifiedSession = vi.fn();
const getPendingTwoFactorSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getVerifiedSession: () => getVerifiedSession(),
  getPendingTwoFactorSession: () => getPendingTwoFactorSession(),
}));

const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

// The limits, counted in memory as the real table counts them
// (auth-rate-limit.integration.test.ts covers the table).
const attempts = new Map<string, number>();
const limitKey = (limit: { name: string }, parts: string[]) => `${limit.name}|${parts.join("|")}`;
vi.mock("@/lib/auth-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-rate-limit")>();
  return {
    ...actual,
    overLimit: async (limit: { name: string; max: number }, parts: string[]) => {
      const key = limitKey(limit, parts);
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      return attempts.get(key)! > limit.max;
    },
    resetLimit: async (limit: { name: string }, parts: string[]) => {
      attempts.delete(limitKey(limit, parts));
    },
  };
});

import {
  confirmTwoFactorEnrollment,
  startTwoFactorEnrollment,
  verifyTwoFactor,
} from "@/lib/two-factor-actions";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const FACTOR_ID = "33333333-3333-3333-3333-333333333333";
const WRONG_CODE = "That code isn't right. Check your authenticator app and try again.";

function session(extra: Record<string, unknown> = {}) {
  return {
    user: { id: USER_ID, email: "sam@gayflix.test", role: "user", name: null },
    sessionId: "22222222-2222-2222-2222-222222222222",
    aal: "aal1",
    totpVerifiedAt: null,
    createdAt: Date.now(),
    hasVerifiedTotp: false,
    ...extra,
  };
}

/** An MFA error as supabase-js returns it. */
function mfaError(code: string, status = 422) {
  return { data: null, error: { name: "AuthApiError", code, status, message: "Supabase's own wording" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  attempts.clear();
  getVerifiedSession.mockResolvedValue(session());
  getPendingTwoFactorSession.mockResolvedValue(session({ hasVerifiedTotp: true }));
  mfa.listFactors.mockResolvedValue({
    data: { all: [], totp: [], phone: [], webauthn: [] },
    error: null,
  });
  mfa.unenroll.mockResolvedValue({ data: {}, error: null });
  mfa.enroll.mockResolvedValue({
    data: {
      id: FACTOR_ID,
      type: "totp",
      totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"></svg>', secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" },
    },
    error: null,
  });
  mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  auth.refreshSession.mockResolvedValue({ data: {}, error: null });
});

describe("startTwoFactorEnrollment", () => {
  it("enrolls a TOTP factor for Gayflix and returns its QR code and key", async () => {
    await expect(startTwoFactorEnrollment()).resolves.toEqual({
      factorId: FACTOR_ID,
      qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      secret: "JBSWY3DPEHPK3PXP",
    });
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: "totp", issuer: "Gayflix" });
  });

  it("first removes setups that were never finished, and only those", async () => {
    mfa.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: "old-unverified", factor_type: "totp", status: "unverified" },
          { id: "phone", factor_type: "phone", status: "unverified" },
        ],
        totp: [],
      },
      error: null,
    });
    await startTwoFactorEnrollment();
    expect(mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "old-unverified" });
  });

  it("refuses without a live session", async () => {
    getVerifiedSession.mockResolvedValue(null);
    expect(await startTwoFactorEnrollment()).toHaveProperty("error");
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("refuses when two-factor is already on", async () => {
    getVerifiedSession.mockResolvedValue(session({ aal: "aal2", hasVerifiedTotp: true }));
    expect(await startTwoFactorEnrollment()).toEqual({ error: "Two-factor sign-in is already on." });
    expect(mfa.enroll).not.toHaveBeenCalled();
  });
});

describe("confirmTwoFactorEnrollment", () => {
  it("checks the first code against the new factor, then refreshes the session", async () => {
    await expect(confirmTwoFactorEnrollment(FACTOR_ID, "123456")).resolves.toEqual({ ok: true });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: FACTOR_ID, code: "123456" });
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it("says a wrong code isn't right", async () => {
    mfa.challengeAndVerify.mockResolvedValue(mfaError("mfa_verification_failed"));
    expect(await confirmTwoFactorEnrollment(FACTOR_ID, "000000")).toEqual({ error: WRONG_CODE });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  for (const [what, factorId, code] of [
    ["a malformed factor id", "not-a-uuid", "123456"],
    ["a non-string factor id", 42, "123456"],
    ["a short code", FACTOR_ID, "12345"],
    ["a code with letters", FACTOR_ID, "12345a"],
    ["a non-string code", FACTOR_ID, 123456],
  ] as const) {
    it(`refuses ${what} without calling Supabase`, async () => {
      expect(await confirmTwoFactorEnrollment(factorId, code)).toHaveProperty("error");
      expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
    });
  }

  it("allows 5 code checks per account in a window, then refuses without asking Supabase", async () => {
    mfa.challengeAndVerify.mockResolvedValue(mfaError("mfa_verification_failed"));
    for (let i = 0; i < 5; i++) await confirmTwoFactorEnrollment(FACTOR_ID, "000000");
    expect(await confirmTwoFactorEnrollment(FACTOR_ID, "000000")).toEqual({
      error: "Too many attempts. Try again later.",
    });
    expect(mfa.challengeAndVerify).toHaveBeenCalledTimes(5);
  });
});

describe("verifyTwoFactor", () => {
  beforeEach(() => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: FACTOR_ID }], totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }] },
      error: null,
    });
  });

  it("checks the code against the account's TOTP factor, then goes to next", async () => {
    await expect(verifyTwoFactor("123456", "/admin/dashboard")).rejects.toMatchObject({ url: "/admin/dashboard" });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: FACTOR_ID, code: "123456" });
  });

  it("drops a next that leaves the site", async () => {
    await expect(verifyTwoFactor("123456", "//evil.example")).rejects.toMatchObject({ url: "/account" });
  });

  it("says a wrong code isn't right", async () => {
    mfa.challengeAndVerify.mockResolvedValue(mfaError("mfa_verification_failed"));
    expect(await verifyTwoFactor("000000", "/account")).toEqual({ error: WRONG_CODE });
  });

  it("refuses a malformed code without calling Supabase", async () => {
    expect(await verifyTwoFactor("12 34 56", "/account")).toHaveProperty("error");
    expect(await verifyTwoFactor(undefined, "/account")).toHaveProperty("error");
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("refuses when no sign-in is waiting for a code", async () => {
    getPendingTwoFactorSession.mockResolvedValue(null);
    expect(await verifyTwoFactor("123456", "/account")).toEqual({
      error: "Your sign-in has ended. Start over and log in again.",
    });
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("allows 5 codes per account in a window, then refuses without asking Supabase", async () => {
    mfa.challengeAndVerify.mockResolvedValue(mfaError("mfa_verification_failed"));
    for (let i = 0; i < 5; i++) await verifyTwoFactor("000000", "/account");
    expect(await verifyTwoFactor("000000", "/account")).toEqual({ error: "Too many attempts. Try again later." });
    expect(mfa.challengeAndVerify).toHaveBeenCalledTimes(5);
  });

  it("caps codes from one client across accounts", async () => {
    mfa.challengeAndVerify.mockResolvedValue(mfaError("mfa_verification_failed"));
    for (let i = 0; i < 30; i++) {
      getPendingTwoFactorSession.mockResolvedValue(
        session({ user: { id: `user-${i}`, email: "x@gayflix.test", role: "user", name: null } })
      );
      await verifyTwoFactor("000000", "/account");
    }
    getPendingTwoFactorSession.mockResolvedValue(session());
    expect(await verifyTwoFactor("000000", "/account")).toEqual({ error: "Too many attempts. Try again later." });
  });
});
