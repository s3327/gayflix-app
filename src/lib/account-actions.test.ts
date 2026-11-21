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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const mfa = { listFactors: vi.fn(), unenroll: vi.fn() };
const auth = { mfa, refreshSession: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth }),
}));

const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ auth: { admin: { deleteUser } } }),
}));

const mockCheckPassword = vi.fn();
vi.mock("@/lib/supabase/password-check", () => ({
  checkPassword: (...args: unknown[]) => mockCheckPassword(...args),
}));

const mockVerifyCode = vi.fn();
vi.mock("@/lib/supabase/email-change", () => ({
  verifyEmailChangeCode: (...args: unknown[]) => mockVerifyCode(...args),
}));

const profile = {
  hasPasswordSignIn: vi.fn(),
  deleteAccountSession: vi.fn(),
  listAccountSessions: vi.fn(),
  signInMethods: vi.fn(),
  pendingEmailChange: vi.fn(),
};
vi.mock("@/lib/auth-profile", () => ({
  hasPasswordSignIn: (...args: unknown[]) => profile.hasPasswordSignIn(...args),
  deleteAccountSession: (...args: unknown[]) => profile.deleteAccountSession(...args),
  listAccountSessions: (...args: unknown[]) => profile.listAccountSessions(...args),
  signInMethods: (...args: unknown[]) => profile.signInMethods(...args),
  pendingEmailChange: (...args: unknown[]) => profile.pendingEmailChange(...args),
}));

// The limits, counted in memory (auth-rate-limit.integration.test.ts covers the table).
const attempts = new Map<string, number>();
const mockResetLimit = vi.fn();
vi.mock("@/lib/auth-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-rate-limit")>();
  return {
    ...actual,
    overLimit: async (limit: { name: string; max: number }, parts: string[]) => {
      const key = `${limit.name}|${parts.join("|")}`;
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      return attempts.get(key)! > limit.max;
    },
    resetLimit: (...args: unknown[]) => mockResetLimit(...args),
  };
});

import {
  changePassword,
  confirmEmailChange,
  deleteAccount,
  disableTwoFactorAction,
  linkedSignInMethods,
  listDevices,
  requestEmailChange,
  signOutDevice,
  signOutOtherDevices,
  updateDisplayName,
} from "@/lib/account-actions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const FACTOR_ID = "44444444-4444-4444-8444-444444444444";
const EMAIL = "member@gayflix.test";
const NEW_EMAIL = "member+new@gayflix.test";

function session(role = "user") {
  return {
    user: { id: USER_ID, email: EMAIL, role, name: null },
    sessionId: SESSION_ID,
    aal: "aal2",
    hasVerifiedTotp: true,
  };
}

const ok = { data: {}, error: null };

/** The error message of a result, or undefined when it's ok. */
const errorOf = (result: { ok: true } | { error: string }) => ("error" in result ? result.error : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  attempts.clear();
  delete process.env.ADMIN_REQUIRE_2FA;
  mockGetSession.mockResolvedValue(session());
  mockCheckPassword.mockResolvedValue("ok");
  profile.hasPasswordSignIn.mockResolvedValue(true);
  profile.deleteAccountSession.mockResolvedValue(1);
  mfa.listFactors.mockResolvedValue({
    data: { all: [{ id: FACTOR_ID }], totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }] },
    error: null,
  });
  mfa.unenroll.mockResolvedValue(ok);
  auth.refreshSession.mockResolvedValue(ok);
  auth.updateUser.mockResolvedValue(ok);
  auth.signOut.mockResolvedValue({ error: null });
  deleteUser.mockResolvedValue(ok);
  profile.pendingEmailChange.mockResolvedValue({ newEmail: NEW_EMAIL, currentPending: true, newPending: true });
  // The first accepted code waits for the other; the second finishes the change.
  mockVerifyCode.mockResolvedValueOnce({ accepted: true }).mockResolvedValueOnce({ changed: USER_ID });
});

describe("disableTwoFactorAction", () => {
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
    expect(mockCheckPassword).toHaveBeenCalledWith(EMAIL, "correct_password");
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

describe("changePassword", () => {
  it("checks the current password, sets the new one, and signs out the other devices", async () => {
    expect(await changePassword("old-password", "new-password")).toEqual({ ok: true });
    expect(mockCheckPassword).toHaveBeenCalledWith(EMAIL, "old-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("refuses a wrong current password, changing nothing", async () => {
    mockCheckPassword.mockResolvedValue("wrong");
    expect(await changePassword("guess", "new-password")).toEqual({ error: "That password isn't right." });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("checks its arguments before anything else", async () => {
    expect(await changePassword("", "new-password")).toEqual({ error: "Enter your current password." });
    expect(await changePassword("old-password", "short")).toEqual({
      error: "Use at least 8 characters for your password.",
    });
    expect(await changePassword("old-password", 12345678)).toEqual({
      error: "Use at least 8 characters for your password.",
    });
    expect(mockCheckPassword).not.toHaveBeenCalled();
  });

  it("says a Google-only account has no password to change", async () => {
    profile.hasPasswordSignIn.mockResolvedValue(false);
    expect(errorOf(await changePassword("anything", "new-password"))).toMatch(/Google/);
    expect(mockCheckPassword).not.toHaveBeenCalled();
  });

  it("is limited like every password check", async () => {
    mockCheckPassword.mockResolvedValue("wrong");
    for (let i = 0; i < 5; i++) await changePassword("guess", "new-password");
    expect(await changePassword("guess", "new-password")).toEqual({ error: "Too many attempts. Try again later." });
    expect(mockCheckPassword).toHaveBeenCalledTimes(5);
  });

  it("explains Supabase's refusal in the site's words", async () => {
    auth.updateUser.mockResolvedValue({ data: null, error: { code: "same_password", status: 422 } });
    expect(await changePassword("old-password", "old-password")).toEqual({
      error: "Choose a password different from your current one.",
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(errorOf(await changePassword("old-password", "new-password"))).toMatch(/log in again/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("requestEmailChange", () => {
  it("checks the password, then asks Supabase to email a code to the new address", async () => {
    expect(await requestEmailChange(` ${NEW_EMAIL} `, "my-password")).toEqual({ ok: true });
    expect(mockCheckPassword).toHaveBeenCalledWith(EMAIL, "my-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ email: NEW_EMAIL });
    // New codes: their checks start afresh, at both addresses.
    for (const address of [EMAIL, NEW_EMAIL]) {
      expect(mockResetLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "code-check" }), [
        "email_change",
        address,
      ]);
    }
  });

  it("can't skip the password when the account has one", async () => {
    expect(await requestEmailChange(NEW_EMAIL, undefined)).toEqual({
      error: "Enter your password to change your email.",
    });
    expect(await requestEmailChange(NEW_EMAIL, "")).toEqual({
      error: "Enter your password to change your email.",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong password", async () => {
    mockCheckPassword.mockResolvedValue("wrong");
    expect(await requestEmailChange(NEW_EMAIL, "guess")).toEqual({ error: "That password isn't right." });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("needs no password for a Google-only account", async () => {
    profile.hasPasswordSignIn.mockResolvedValue(false);
    expect(await requestEmailChange(NEW_EMAIL, undefined)).toEqual({ ok: true });
    expect(mockCheckPassword).not.toHaveBeenCalled();
  });

  it("refuses something that isn't an email, or the current one", async () => {
    expect(await requestEmailChange("nope", "my-password")).toEqual({ error: "Enter a valid email address." });
    expect(await requestEmailChange(EMAIL.toUpperCase(), "my-password")).toEqual({
      error: "That's already your email.",
    });
    expect(mockCheckPassword).not.toHaveBeenCalled();
  });

  it("says when the address belongs to another account", async () => {
    auth.updateUser.mockResolvedValue({ data: null, error: { code: "email_exists", status: 422 } });
    expect(await requestEmailChange(NEW_EMAIL, "my-password")).toEqual({
      error: "That email is already used by another account.",
    });
  });
});

describe("confirmEmailChange", () => {
  it("checks the code from each address, then refreshes this session so it carries the new email", async () => {
    expect(await confirmEmailChange(NEW_EMAIL, "111111", "222222")).toEqual({ ok: true });
    expect(mockVerifyCode).toHaveBeenNthCalledWith(1, EMAIL, "111111");
    expect(mockVerifyCode).toHaveBeenNthCalledWith(2, NEW_EMAIL, "222222");
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it("needs both codes in shape before checking either", async () => {
    const shape = { error: "Enter both 6-digit codes: one from each email." };
    expect(await confirmEmailChange(NEW_EMAIL, "12345", "222222")).toEqual(shape);
    expect(await confirmEmailChange(NEW_EMAIL, "111111", undefined)).toEqual(shape);
    expect(await confirmEmailChange(NEW_EMAIL, 111111, "222222")).toEqual(shape);
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("says which code is wrong, and leaves the change waiting", async () => {
    mockVerifyCode.mockReset().mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    expect(await confirmEmailChange(NEW_EMAIL, "000000", "222222")).toEqual({
      error: "The code from your current email isn't right, or it has expired.",
    });
    mockVerifyCode.mockReset().mockResolvedValueOnce({ accepted: true }).mockResolvedValueOnce({
      error: { code: "otp_expired", status: 403 },
    });
    expect(await confirmEmailChange(NEW_EMAIL, "111111", "000000")).toEqual({
      error: "The code from your new email isn't right, or it has expired.",
    });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("only checks the code still owed when one was accepted before", async () => {
    profile.pendingEmailChange.mockResolvedValue({ newEmail: NEW_EMAIL, currentPending: false, newPending: true });
    mockVerifyCode.mockReset().mockResolvedValue({ changed: USER_ID });
    expect(await confirmEmailChange(NEW_EMAIL, "111111", "222222")).toEqual({ ok: true });
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    expect(mockVerifyCode).toHaveBeenCalledWith(NEW_EMAIL, "222222");
  });

  it("refuses when no change to that address is waiting", async () => {
    profile.pendingEmailChange.mockResolvedValue(null);
    expect(errorOf(await confirmEmailChange(NEW_EMAIL, "111111", "222222"))).toMatch(/start again/i);
    profile.pendingEmailChange.mockResolvedValue({ newEmail: "other@gayflix.test", currentPending: true, newPending: true });
    expect(errorOf(await confirmEmailChange(NEW_EMAIL, "111111", "222222"))).toMatch(/start again/i);
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("limits code checks at each address, refusing without checking", async () => {
    mockVerifyCode.mockReset().mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    for (let i = 0; i < 5; i++) await confirmEmailChange(NEW_EMAIL, "000000", "000000");
    expect(await confirmEmailChange(NEW_EMAIL, "000000", "000000")).toEqual({ error: "Too many attempts. Try again later." });
    expect(mockVerifyCode).toHaveBeenCalledTimes(5);
    expect([...attempts.keys()]).toEqual(
      expect.arrayContaining([`code-check|email_change|${EMAIL}`, `code-check|email_change|${NEW_EMAIL}`])
    );
  });

  it("refuses a change that finished on some other account", async () => {
    mockVerifyCode.mockReset().mockResolvedValueOnce({ accepted: true }).mockResolvedValueOnce({
      changed: "99999999-9999-4999-8999-999999999999",
    });
    expect(await confirmEmailChange(NEW_EMAIL, "111111", "222222")).toEqual({ error: "Something went wrong. Please try again." });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe("updateDisplayName", () => {
  it("saves the trimmed name in the account's metadata and refreshes the session", async () => {
    expect(await updateDisplayName("  Sam  ")).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { name: "Sam" } });
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it("refuses an empty or overlong name", async () => {
    expect(await updateDisplayName("   ")).toEqual({ error: "Enter your name." });
    expect(await updateDisplayName("x".repeat(101))).toEqual({ error: "Use at most 100 characters for your name." });
    expect(await updateDisplayName(null)).toEqual({ error: "Enter your name." });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("listDevices", () => {
  it("lists the account's sessions, marking this one", async () => {
    const createdAt = new Date("2026-11-01T00:00:00Z");
    const lastActiveAt = new Date("2026-11-20T00:00:00Z");
    profile.listAccountSessions.mockResolvedValue([
      { id: OTHER_SESSION_ID, userAgent: "Firefox", createdAt, lastActiveAt },
      { id: SESSION_ID, userAgent: null, createdAt, lastActiveAt },
    ]);
    expect(await listDevices()).toEqual([
      { id: OTHER_SESSION_ID, userAgent: "Firefox", createdAt, lastActiveAt, current: false },
      { id: SESSION_ID, userAgent: null, createdAt, lastActiveAt, current: true },
    ]);
    expect(profile.listAccountSessions).toHaveBeenCalledWith(USER_ID);
  });

  it("is empty for a signed-out visitor", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await listDevices()).toEqual([]);
    expect(profile.listAccountSessions).not.toHaveBeenCalled();
  });
});

describe("signOutDevice", () => {
  it("deletes only the signed-in account's own session with that id", async () => {
    await signOutDevice(OTHER_SESSION_ID);
    expect(profile.deleteAccountSession).toHaveBeenCalledWith(USER_ID, OTHER_SESSION_ID);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/account/setting");
  });

  it("refuses an id that isn't a UUID", async () => {
    await expect(signOutDevice("not-a-session")).rejects.toThrow("Invalid device");
    await expect(signOutDevice({ id: OTHER_SESSION_ID })).rejects.toThrow("Invalid device");
    expect(profile.deleteAccountSession).not.toHaveBeenCalled();
  });

  it("refuses this device's own session (that's Log Out)", async () => {
    await expect(signOutDevice(SESSION_ID)).rejects.toThrow("Invalid device");
    await expect(signOutDevice(SESSION_ID.toUpperCase())).rejects.toThrow("Invalid device");
    expect(profile.deleteAccountSession).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(signOutDevice(OTHER_SESSION_ID)).rejects.toThrow("Not signed in");
    expect(profile.deleteAccountSession).not.toHaveBeenCalled();
  });
});

describe("signOutOtherDevices", () => {
  it("ends every session but this one", async () => {
    await signOutOtherDevices();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/account/setting");
  });
});

describe("linkedSignInMethods", () => {
  it("reads the signed-in account's sign-in methods", async () => {
    profile.signInMethods.mockResolvedValue(["email", "google"]);
    expect(await linkedSignInMethods()).toEqual(["email", "google"]);
    expect(profile.signInMethods).toHaveBeenCalledWith(USER_ID);
  });
});

describe("deleteAccount", () => {
  it("refuses an owner with the existing message, deleting nothing", async () => {
    mockGetSession.mockResolvedValue(session("owner"));
    expect(await deleteAccount("my-password")).toEqual({
      error: "Admin accounts can't be deleted. Ask another admin to remove your admin role first.",
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(mockCheckPassword).not.toHaveBeenCalled();
  });

  it("needs the password when the account has one", async () => {
    expect(await deleteAccount()).toEqual({ error: "Enter your password to delete your account." });
    expect(await deleteAccount("")).toEqual({ error: "Enter your password to delete your account." });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong password", async () => {
    mockCheckPassword.mockResolvedValue("wrong");
    expect(await deleteAccount("guess")).toEqual({ error: "That password isn't right." });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the account, signs out and goes home", async () => {
    await expect(deleteAccount("my-password")).rejects.toThrow("NEXT_REDIRECT /home");
    expect(mockCheckPassword).toHaveBeenCalledWith(EMAIL, "my-password");
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("needs no password for a Google-only account", async () => {
    profile.hasPasswordSignIn.mockResolvedValue(false);
    await expect(deleteAccount()).rejects.toThrow("NEXT_REDIRECT /home");
    expect(mockCheckPassword).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("says so when Supabase won't delete it, keeping the session", async () => {
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure" } });
    expect(await deleteAccount("my-password")).toEqual({ error: "Something went wrong. Please try again." });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
