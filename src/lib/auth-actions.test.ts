import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sign-up and sign-in server actions, and the Google callback, with
 * the Supabase client mocked. What's checked: arguments are validated
 * before Supabase is called, Supabase's errors become readable messages,
 * and redirects stay on this site.
 */

const auth = {
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  resend: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
};
const createServerSupabase = vi.fn(async () => ({ auth }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => createServerSupabase(),
}));

const requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeaders),
}));

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

import {
  requestPasswordReset,
  resendEmailCode,
  resetPassword,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  verifyEmailCode,
} from "@/lib/auth-actions";
import { GET as callback } from "@/app/auth/callback/route";

const EMAIL = "jamie@example.com";
const PASSWORD = "a-good-password";
const NO_ERROR = { data: {}, error: null };

/** An error as supabase-js returns it (AuthApiError's fields). */
function authError(code: string, status = 400, message = "Supabase's own wording") {
  return { data: { user: null, session: null }, error: { name: "AuthApiError", code, status, message } };
}

function supabaseCalls() {
  return [
    auth.signUp,
    auth.verifyOtp,
    auth.resend,
    auth.signInWithPassword,
    auth.signInWithOAuth,
    auth.resetPasswordForEmail,
    auth.updateUser,
    auth.signOut,
  ].flatMap((fn) => fn.mock.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [auth.signUp, auth.verifyOtp, auth.resend, auth.resetPasswordForEmail, auth.updateUser, auth.signOut]) {
    fn.mockResolvedValue(NO_ERROR);
  }
  auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null });
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  for (const name of [...requestHeaders.keys()]) requestHeaders.delete(name);
  requestHeaders.set("origin", "https://gayflix.test");
});

describe("argument checks", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["signUp without an email", () => signUp(undefined, PASSWORD, "Jamie")],
    ["signUp with a malformed email", () => signUp("not-an-email", PASSWORD, "Jamie")],
    ["signUp with a very long email", () => signUp(`${"a".repeat(250)}@example.com`, PASSWORD, "Jamie")],
    ["signUp with a short password", () => signUp(EMAIL, "short", "Jamie")],
    ["signUp with a very long password", () => signUp(EMAIL, "p".repeat(129), "Jamie")],
    ["signUp with a blank name", () => signUp(EMAIL, PASSWORD, "   ")],
    ["signUp with a very long name", () => signUp(EMAIL, PASSWORD, "n".repeat(101))],
    ["signUp with a non-string name", () => signUp(EMAIL, PASSWORD, { name: "Jamie" })],
    ["verifyEmailCode with a 5-digit code", () => verifyEmailCode(EMAIL, "12345")],
    ["verifyEmailCode with letters", () => verifyEmailCode(EMAIL, "12a456")],
    ["verifyEmailCode with a bad email", () => verifyEmailCode("nope", "123456")],
    ["resendEmailCode with a number", () => resendEmailCode(42)],
    ["signIn without a password", () => signIn(EMAIL, "")],
    ["signIn with a very long password", () => signIn(EMAIL, "p".repeat(129))],
    ["signIn with an array email", () => signIn([EMAIL], PASSWORD)],
    ["requestPasswordReset with a bad email", () => requestPasswordReset("@example.com")],
    ["resetPassword with a bad code", () => resetPassword(EMAIL, "abcdef", PASSWORD)],
    ["resetPassword with a short password", () => resetPassword(EMAIL, "123456", "short")],
    ["resetPassword with a bad email", () => resetPassword("x", "123456", PASSWORD)],
  ];

  it.each(cases)("%s returns an error without calling Supabase", async (_name, call) => {
    const result = await call();
    expect(result).toEqual({ error: expect.any(String) });
    expect((result as { error: string }).error).not.toBe("");
    expect(supabaseCalls()).toEqual([]);
  });

  it("signInWithGoogle with a non-string next doesn't call Supabase", async () => {
    await expect(signInWithGoogle({ next: "/home" })).resolves.toEqual({ error: expect.any(String) });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  it("creates the account with the name in the user's metadata", async () => {
    await expect(signUp(` ${EMAIL} `, PASSWORD, " Jamie Rivera ")).resolves.toEqual({ ok: true });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
      options: { data: { name: "Jamie Rivera" } },
    });
  });

  it.each(["user_already_exists", "email_exists"])(
    "answers as for a new account when Supabase says %s, so sign-up shows nobody who has an account",
    async (code) => {
      auth.signUp.mockResolvedValue(authError(code, 422));
      await expect(signUp(EMAIL, PASSWORD, "Jamie")).resolves.toEqual({ ok: true });
    }
  );

  it("says registration is closed when the sign-up hook refuses it", async () => {
    auth.signUp.mockResolvedValue(authError("unknown", 403, "Public registration is currently closed."));
    await expect(signUp(EMAIL, PASSWORD, "Jamie")).resolves.toEqual({
      error: "Public registration is currently closed.",
    });
  });

  it("explains a password Supabase calls weak", async () => {
    auth.signUp.mockResolvedValue(authError("weak_password", 422));
    const result = await signUp(EMAIL, PASSWORD, "Jamie");
    expect(result).toEqual({ error: expect.stringMatching(/password/i) });
  });
});

describe("verifyEmailCode", () => {
  it("checks the code as a sign-up code", async () => {
    await expect(verifyEmailCode(EMAIL, "123456")).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "signup" });
  });

  it("says a wrong or expired code isn't right", async () => {
    auth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    await expect(verifyEmailCode(EMAIL, "000000")).resolves.toEqual({
      error: "That code isn't right, or it has expired. Check the email, or send a new code.",
    });
  });
});

describe("resendEmailCode", () => {
  it("resends the sign-up code", async () => {
    await expect(resendEmailCode(EMAIL)).resolves.toEqual({ ok: true });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: EMAIL });
  });
});

describe("signIn", () => {
  it("signs in and goes to next", async () => {
    await expect(signIn(EMAIL, PASSWORD, "/title/abc")).rejects.toMatchObject({ url: "/title/abc" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each([undefined, "//evil.example", "https://evil.example", 7])(
    "goes to /account instead of next=%s",
    async (next) => {
      await expect(signIn(EMAIL, PASSWORD, next)).rejects.toMatchObject({ url: "/account" });
    }
  );

  it("rejects a wrong password", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("invalid_credentials"));
    await expect(signIn(EMAIL, "not-the-password")).resolves.toEqual({
      error: "That email and password don't match.",
    });
  });

  it("sends a fresh code to an account whose email isn't confirmed", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("email_not_confirmed"));
    await expect(signIn(EMAIL, PASSWORD)).resolves.toEqual({ needsEmailCode: true });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: EMAIL });
  });

  it("says a banned account is banned", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("user_banned"));
    await expect(signIn(EMAIL, PASSWORD)).resolves.toEqual({ error: "This account has been banned." });
  });

  it("asks for two-factor when the account has a verified TOTP factor, without keeping the session", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    await expect(signIn(EMAIL, PASSWORD)).resolves.toEqual({ needsTwoFactor: true });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("asks to wait when Supabase rate-limits", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("over_request_rate_limit", 429));
    await expect(signIn(EMAIL, PASSWORD)).resolves.toEqual({
      error: "Too many attempts. Please wait a minute and try again.",
    });
  });

  it("never shows Supabase's own wording for an unknown error", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("unexpected_failure", 500, "pq: relation missing"));
    await expect(signIn(EMAIL, PASSWORD)).resolves.toEqual({
      error: "Something went wrong. Please try again.",
    });
  });
});

describe("requestPasswordReset", () => {
  it("returns ok for an unknown email", async () => {
    await expect(requestPasswordReset("nobody-here@example.com")).resolves.toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("nobody-here@example.com");
  });

  it("returns ok even when Supabase refuses, so the answer never depends on the account", async () => {
    auth.resetPasswordForEmail.mockResolvedValue(authError("over_email_send_rate_limit", 429));
    await expect(requestPasswordReset(EMAIL)).resolves.toEqual({ ok: true });
  });
});

describe("resetPassword", () => {
  it("checks the recovery code, sets the password, then signs out everywhere", async () => {
    await expect(resetPassword(EMAIL, "123456", PASSWORD)).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "recovery" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: PASSWORD });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    const order = [auth.verifyOtp, auth.updateUser, auth.signOut].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("doesn't touch the password when the code is wrong", async () => {
    auth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    const result = await resetPassword(EMAIL, "000000", PASSWORD);
    expect(result).toEqual({ error: expect.stringMatching(/code/) });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("leaves no session behind when the new password is refused", async () => {
    auth.updateUser.mockResolvedValue(authError("same_password", 422));
    const result = await resetPassword(EMAIL, "123456", PASSWORD);
    expect(result).toEqual({ error: expect.stringMatching(/password/i) });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("signInWithGoogle", () => {
  it("sends the browser to Google, coming back to /auth/callback with next", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.test/o" }, error: null });
    await expect(signInWithGoogle("/title/abc?tab=1")).rejects.toMatchObject({
      url: "https://accounts.google.test/o",
    });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `https://gayflix.test/auth/callback?next=${encodeURIComponent("/title/abc?tab=1")}`,
        skipBrowserRedirect: true,
      },
    });
  });

  it("drops a next that leaves the site", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.test/o" }, error: null });
    await expect(signInWithGoogle("//evil.example")).rejects.toBeInstanceOf(RedirectError);
    const { redirectTo } = auth.signInWithOAuth.mock.calls[0][0].options;
    expect(redirectTo).toBe("https://gayflix.test/auth/callback?next=%2Fhome");
  });

  it("says so when Google sign-in isn't set up", async () => {
    auth.signInWithOAuth.mockResolvedValue(authError("validation_failed", 400, "Unsupported provider"));
    await expect(signInWithGoogle("/home")).resolves.toEqual({ error: expect.stringMatching(/Google/) });
  });
});

describe("signOut", () => {
  it("ends only this device's session, then goes to next", async () => {
    await expect(signOut("/admin/login")).rejects.toMatchObject({ url: "/admin/login" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("goes to /home instead of a next that leaves the site", async () => {
    await expect(signOut("//evil.example")).rejects.toMatchObject({ url: "/home" });
  });

  it("stays put and says so when Supabase can't sign out", async () => {
    auth.signOut.mockResolvedValue(authError("unexpected_failure", 500));
    await expect(signOut("/home")).resolves.toEqual({ error: "Something went wrong. Please try again." });
  });
});

describe("GET /auth/callback", () => {
  function callbackRequest(query: string) {
    return new NextRequest(`https://gayflix.test/auth/callback?${query}`);
  }

  it("exchanges the code for a session and goes to next", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    const response = await callback(callbackRequest("code=abc&next=%2Ftitle%2Fx%3Fs%3D1"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://gayflix.test/title/x?s=1");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "evil"])(
    "goes to /home instead of next=%s",
    async (next) => {
      auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
      const response = await callback(callbackRequest(`code=abc&next=${encodeURIComponent(next)}`));
      expect(response.headers.get("location")).toBe("https://gayflix.test/home");
    }
  );

  it("sends a failed sign-in back to /login with an error", async () => {
    auth.exchangeCodeForSession.mockResolvedValue(authError("bad_code_verifier"));
    const response = await callback(callbackRequest("code=abc&next=%2Faccount"));
    expect(response.headers.get("location")).toBe("https://gayflix.test/login?error=google&next=%2Faccount");
  });

  it("doesn't call Supabase without a code (Google said no)", async () => {
    const response = await callback(callbackRequest("error=access_denied"));
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://gayflix.test/login?error=google");
  });
});
