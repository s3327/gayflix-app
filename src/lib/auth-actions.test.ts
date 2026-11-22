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

// Work deferred with after() runs when the test says the response has gone.
const afterResponse: (() => Promise<void>)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => afterResponse.push(task),
}));
async function finishResponse() {
  for (const task of afterResponse.splice(0)) await task();
}

const settings = { registrationOpen: true };
vi.mock("@/lib/site-settings", () => ({
  getSiteSettings: async () => settings,
}));

// Sign-up's minimum duration is tested in auth-timing.test.ts; here it
// just runs the work.
vi.mock("@/lib/auth-timing", () => ({
  atLeast: (_floor: number, work: () => Promise<unknown>) => work(),
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

// resetPassword sets the new password through Auth's admin API.
const updateUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ auth: { admin: { updateUserById } } }),
}));

// The admin log-in's role check reads profile.role.
const profileRole = vi.fn();
vi.mock("@/lib/auth-profile", () => ({
  profileRole: (userId: string) => profileRole(userId),
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
  signInToAdmin,
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
  // A right emailed code signs that account in.
  auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null });
  updateUserById.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  for (const name of [...requestHeaders.keys()]) requestHeaders.delete(name);
  requestHeaders.set("origin", "https://gayflix.test");
  requestHeaders.set("x-forwarded-for", "203.0.113.7");
  attempts.clear();
  afterResponse.length = 0;
  settings.registrationOpen = true;
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

  it.each([
    ["a taken address", () => auth.signUp.mockResolvedValue(authError("user_already_exists", 422))],
    ["a new address", () => undefined],
  ])("says registration is closed for %s without asking Supabase while it's closed", async (_name, arrange) => {
    arrange();
    settings.registrationOpen = false;
    await expect(signUp(EMAIL, PASSWORD, "Jamie")).resolves.toEqual({
      error: "Public registration is currently closed.",
    });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

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

  it("asks for two-factor when the account has a verified TOTP factor, keeping the session for the code step", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    await expect(signIn(EMAIL, PASSWORD, "/account")).resolves.toEqual({ needsTwoFactor: true });
    // getSession() treats it as signed out until the code is entered
    // (src/lib/session.test.ts).
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("ends the session when the two-factor check fails, rather than letting it through", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", code: "unexpected_failure", status: 500, message: "boom" },
    });
    await expect(signIn(EMAIL, PASSWORD, "/account")).resolves.toEqual({
      error: "Something went wrong. Please try again.",
    });
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

describe("signInToAdmin", () => {
  beforeEach(() => profileRole.mockResolvedValue("admin"));

  it("signs staff in and goes to the admin page in next", async () => {
    await expect(signInToAdmin(EMAIL, PASSWORD, "/admin/reports")).rejects.toMatchObject({ url: "/admin/reports" });
    expect(profileRole).toHaveBeenCalledWith("u1");
  });

  it("keeps next inside the admin panel", async () => {
    await expect(signInToAdmin(EMAIL, PASSWORD, "/account")).rejects.toMatchObject({ url: "/admin/dashboard" });
    await expect(signInToAdmin(EMAIL, PASSWORD, "https://evil.example/admin")).rejects.toMatchObject({
      url: "/admin/dashboard",
    });
  });

  it("signs a member straight out again and says the account isn't an admin", async () => {
    profileRole.mockResolvedValue("user");
    await expect(signInToAdmin(EMAIL, PASSWORD, "/admin/dashboard")).resolves.toEqual({
      error: "This account doesn't have admin access.",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("asks staff with two-factor for the code, before anything else", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    await expect(signInToAdmin(EMAIL, PASSWORD, "/admin/dashboard")).resolves.toEqual({ needsTwoFactor: true });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("checks the arguments and the password like signIn", async () => {
    expect(await signInToAdmin("nope", PASSWORD, "/admin/dashboard")).toEqual({ error: "Enter a valid email address." });
    auth.signInWithPassword.mockResolvedValue(authError("invalid_credentials"));
    expect(await signInToAdmin(EMAIL, PASSWORD, "/admin/dashboard")).toEqual({
      error: "That email and password don't match.",
    });
    expect(profileRole).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset", () => {
  it("returns ok for an unknown email, and asks Supabase only after answering", async () => {
    await expect(requestPasswordReset("nobody-here@example.com")).resolves.toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    await finishResponse();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("nobody-here@example.com");
  });

  it("returns ok even when Supabase refuses, so the answer never depends on the account", async () => {
    auth.resetPasswordForEmail.mockResolvedValue(authError("over_email_send_rate_limit", 429));
    await expect(requestPasswordReset(EMAIL)).resolves.toEqual({ ok: true });
    await finishResponse();
  });
});

describe("resetPassword", () => {
  // The recovery code's session is aal1, and Auth won't change the
  // password of an account with two-factor from one
  // (src/lib/auth-hooks.integration.test.ts), so the admin API sets it.
  it("checks the recovery code, sets the password for that account, then signs out everywhere", async () => {
    await expect(resetPassword(EMAIL, "123456", PASSWORD)).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "recovery" });
    expect(updateUserById).toHaveBeenCalledWith("u1", { password: PASSWORD });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    const order = [auth.verifyOtp, updateUserById, auth.signOut].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("doesn't touch the password when the code is wrong", async () => {
    auth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    const result = await resetPassword(EMAIL, "000000", PASSWORD);
    expect(result).toEqual({ error: expect.stringMatching(/code/) });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("leaves no session behind when the new password is refused", async () => {
    updateUserById.mockResolvedValue(authError("weak_password", 422));
    const result = await resetPassword(EMAIL, "123456", PASSWORD);
    expect(result).toEqual({ error: expect.stringMatching(/password/i) });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("attempt limits", () => {
  const TOO_MANY = { error: "Too many attempts. Try again later." };

  it("allows 10 sign-in attempts per client and email in a window, then refuses without asking Supabase", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("invalid_credentials"));
    for (let i = 0; i < 10; i++) {
      await expect(signIn(EMAIL, "wrong-password")).resolves.toEqual({ error: "That email and password don't match." });
    }
    await expect(signIn(EMAIL, "wrong-password")).resolves.toEqual(TOO_MANY);
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(10);

    // Another client may still try that email, and this client another email.
    requestHeaders.set("x-forwarded-for", "198.51.100.9");
    await expect(signIn(EMAIL, "wrong-password")).resolves.toEqual({ error: "That email and password don't match." });
    requestHeaders.set("x-forwarded-for", "203.0.113.7");
    await expect(signIn("other@example.com", "wrong-password")).resolves.toEqual({
      error: "That email and password don't match.",
    });
  });

  it("caps sign-in attempts from one client across emails at 50", async () => {
    auth.signInWithPassword.mockResolvedValue(authError("invalid_credentials"));
    for (let i = 0; i < 50; i++) await signIn(`person${i}@example.com`, "wrong-password");
    await expect(signIn("person-new@example.com", "wrong-password")).resolves.toEqual(TOO_MANY);
  });

  it("allows 5 checks of an emailed sign-up code from anywhere, until a new code is sent", async () => {
    auth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    for (let i = 0; i < 5; i++) {
      requestHeaders.set("x-forwarded-for", `192.0.2.${i}`);
      await verifyEmailCode(EMAIL, "000000");
    }
    await expect(verifyEmailCode(EMAIL, "123456")).resolves.toEqual(TOO_MANY);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(5);

    await expect(resendEmailCode(EMAIL)).resolves.toEqual({ ok: true });
    auth.verifyOtp.mockResolvedValue(NO_ERROR);
    await expect(verifyEmailCode(EMAIL, "123456")).resolves.toEqual({ ok: true });
  });

  it("allows 5 checks of a reset code, until a new one is sent", async () => {
    auth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    for (let i = 0; i < 5; i++) await resetPassword(EMAIL, "000000", PASSWORD);
    await expect(resetPassword(EMAIL, "123456", PASSWORD)).resolves.toEqual(TOO_MANY);
    expect(updateUserById).not.toHaveBeenCalled();

    await requestPasswordReset(EMAIL);
    await finishResponse();
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null });
    await expect(resetPassword(EMAIL, "123456", PASSWORD)).resolves.toEqual({ ok: true });
  });

  it("counts a sign-up code and a reset code separately", async () => {
    auth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    for (let i = 0; i < 5; i++) await verifyEmailCode(EMAIL, "000000");
    await expect(resetPassword(EMAIL, "000000", PASSWORD)).resolves.not.toEqual(TOO_MANY);
  });

  it("allows 5 code emails per client and email, then refuses", async () => {
    for (let i = 0; i < 5; i++) await expect(resendEmailCode(EMAIL)).resolves.toEqual({ ok: true });
    await expect(resendEmailCode(EMAIL)).resolves.toEqual(TOO_MANY);
    await expect(requestPasswordReset(EMAIL)).resolves.toEqual(TOO_MANY);
    expect(auth.resend).toHaveBeenCalledTimes(5);
  });

  it("keys sign-in on the client and the lowercased email", async () => {
    await signIn("Jamie@Example.com", PASSWORD).catch(() => {});
    expect([...attempts.keys()]).toEqual(["sign-in|203.0.113.7|jamie@example.com", "sign-in-client|203.0.113.7"]);
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

  it("sends a Google sign-in on an account with two-factor to the code step, keeping next", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const response = await callback(callbackRequest("code=abc&next=%2Ftitle%2Fx"));
    expect(response.headers.get("location")).toBe("https://gayflix.test/login?twoFactor=1&next=%2Ftitle%2Fx");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("ends the session when the two-factor check fails, rather than letting it through", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", code: "unexpected_failure", status: 500, message: "boom" },
    });
    const response = await callback(callbackRequest("code=abc&next=%2Fhome"));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe("https://gayflix.test/login?error=google&next=%2Fhome");
  });

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
