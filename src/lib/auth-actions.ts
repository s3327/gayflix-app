"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { isStaffRole } from "@/lib/admin-roles";
import { authErrorMessage, REGISTRATION_CLOSED } from "@/lib/auth-errors";
import { profileRole } from "@/lib/auth-profile";
import { type AuthLimit, LIMITS, overLimit, resetLimit, TOO_MANY_ATTEMPTS } from "@/lib/auth-rate-limit";
import { atLeast } from "@/lib/auth-timing";
import { safeAdminNextPath, safeNextPath } from "@/lib/safe-redirect";
import { getSiteSettings } from "@/lib/site-settings";
import { siteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientIp } from "@/lib/visitor";

/*
 * Sign-up, sign-in, email codes, password reset, Google and sign-out,
 * with Supabase Auth. The browser never calls Supabase: the forms call
 * these, and the session lands in the HttpOnly cookie that the server
 * client writes (src/lib/supabase/server.ts).
 *
 * Every argument comes from the browser, so each is checked here before
 * Supabase is called. Errors come back as readable messages
 * (src/lib/auth-errors.ts), never Supabase's own wording.
 *
 * Nothing here may tell anyone whether an address has an account: not
 * the answer, and not how long it takes. Password and code attempts are
 * limited per client and per address (src/lib/auth-rate-limit.ts),
 * since Supabase's own per-IP limits only see this server.
 */

type Result = { ok: true } | { error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_NAME = 100;
/**
 * Every sign-up takes at least this long. Supabase sends the email for a
 * new address inside the request (median 670 ms, up to 1.4 s, on the
 * local stack) and nothing for a taken one (about 90 ms).
 */
const SIGN_UP_FLOOR_MS = 1500;

/** The trimmed email, or null when it isn't one. */
function emailArg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** A new password: 8 to 128 characters. */
function newPasswordProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters for your password.`;
  }
  if (value.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters for your password.`;
  return null;
}

const INVALID_EMAIL = { error: "Enter a valid email address." } as const;
const INVALID_CODE = { error: "Enter the 6-digit code from the email." } as const;
const RATE_LIMITED = { error: TOO_MANY_ATTEMPTS } as const;

/**
 * Counts this attempt against a per-address limit and a per-client one
 * (the client's IP; both are stored hashed). True when either is over.
 */
async function limited(perAddress: AuthLimit, addressKey: string[], perClient: AuthLimit): Promise<boolean> {
  const client = await clientIp();
  const overAddress = await overLimit(perAddress, addressKey.map((part) => part.toLowerCase()));
  const overClient = await overLimit(perClient, [client]);
  return overAddress || overClient;
}

/** A new code went to `address`: its code checks start afresh. */
async function newCodeSent(type: "signup" | "recovery", address: string) {
  await resetLimit(LIMITS.codeCheck, [type, address.toLowerCase()]);
}

/**
 * Creates an account; Supabase emails a 6-digit code to confirm it.
 * While an admin has registration closed, every address gets the same
 * "closed" answer and Supabase isn't asked (it would answer a taken
 * address differently). Every path takes at least SIGN_UP_FLOOR_MS.
 */
export async function signUp(email: unknown, password: unknown, name: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  const passwordProblem = newPasswordProblem(password);
  if (passwordProblem) return { error: passwordProblem };
  const displayName = typeof name === "string" ? name.trim() : "";
  if (!displayName) return { error: "Enter your name." };
  if (displayName.length > MAX_NAME) return { error: `Use at most ${MAX_NAME} characters for your name.` };

  return atLeast(SIGN_UP_FLOOR_MS, async (): Promise<Result> => {
    if (!(await getSiteSettings()).registrationOpen) return { error: REGISTRATION_CLOSED };

    const supabase = await createServerSupabase();
    // The name goes in the user's metadata, where getSession() reads it.
    const { error } = await supabase.auth.signUp({
      email: address,
      password: password as string,
      options: { data: { name: displayName } },
    });
    // An email that already has a confirmed account gets the same answer
    // as a new one (and Supabase emails nothing), so sign-up can't tell
    // anyone who has an account. An unconfirmed one gets a fresh code.
    if (error?.code === "user_already_exists" || error?.code === "email_exists") return { ok: true };
    if (error) return { error: authErrorMessage(error) };
    await newCodeSent("signup", address);
    return { ok: true };
  });
}

/** Confirms the email with the code from sign-up, which signs the user in. */
export async function verifyEmailCode(email: unknown, code: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return INVALID_CODE;
  if (await limited(LIMITS.codeCheck, ["signup", address], LIMITS.codeCheckPerClient)) return RATE_LIMITED;

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: address, token: code, type: "signup" });
  return error ? { error: authErrorMessage(error) } : { ok: true };
}

/** Emails a new sign-up code. */
export async function resendEmailCode(email: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  const client = await clientIp();
  if (await limited(LIMITS.emailSend, [client, address], LIMITS.emailSendPerClient)) return RATE_LIMITED;

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resend({ type: "signup", email: address });
  if (error) return { error: authErrorMessage(error) };
  await newCodeSent("signup", address);
  return { ok: true };
}

type SignInResult = { error: string } | { needsEmailCode: true } | { needsTwoFactor: true };

/**
 * The password step both log-in forms share. Either something to tell
 * the form, or a password session for the account (`userId`), and
 * whether it still needs its two-factor code.
 * - An account whose email was never confirmed gets a fresh code and
 *   `needsEmailCode` (Supabase only says so once the password is right).
 * - An account with two-factor keeps its password-only (aal1) session
 *   for the code step (verifyTwoFactor in src/lib/two-factor-actions.ts).
 *   Until the code is entered, every session read treats it as signed
 *   out (src/lib/session.ts). If the two-factor check itself fails, the
 *   session is ended, rather than let through.
 */
async function passwordStep(
  email: unknown,
  password: unknown
): Promise<
  | { result: SignInResult }
  | { userId: string; needsTwoFactor: boolean; supabase: Awaited<ReturnType<typeof createServerSupabase>> }
> {
  const address = emailArg(email);
  if (!address) return { result: INVALID_EMAIL };
  if (typeof password !== "string" || !password) return { result: { error: "Enter your password." } };
  if (password.length > MAX_PASSWORD) return { result: { error: "That email and password don't match." } };
  const client = await clientIp();
  if (await limited(LIMITS.signIn, [client, address], LIMITS.signInPerClient)) return { result: RATE_LIMITED };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (error?.code === "email_not_confirmed") {
    // A failed resend (sent too recently, say) still leaves the
    // verify page's own Resend button.
    const resent = await supabase.auth.resend({ type: "signup", email: address });
    if (!resent.error) await newCodeSent("signup", address);
    return { result: { needsEmailCode: true } };
  }
  if (error || !data.user) return { result: { error: authErrorMessage(error) || "Something went wrong. Please try again." } };

  const { data: levels, error: levelsError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (levelsError || !levels) {
    await supabase.auth.signOut({ scope: "local" });
    return { result: { error: "Something went wrong. Please try again." } };
  }
  return {
    userId: data.user.id,
    needsTwoFactor: levels.nextLevel === "aal2" && levels.currentLevel !== "aal2",
    supabase,
  };
}

/**
 * Signs in with email and password, then sends the browser to `next` (a
 * path on this site, else /account). The redirect happens here rather
 * than in the browser: setting the session cookie re-renders the page
 * the form is on, and /login sends signed-in visitors on by itself, so a
 * navigation started in the browser afterwards would race it. An
 * unconfirmed email gets `needsEmailCode`, an account with two-factor
 * `needsTwoFactor` (see passwordStep).
 */
export async function signIn(email: unknown, password: unknown, next?: unknown): Promise<SignInResult> {
  const step = await passwordStep(email, password);
  if ("result" in step) return step.result;
  if (step.needsTwoFactor) return { needsTwoFactor: true };
  redirect(safeNextPath(typeof next === "string" ? next : null, "/account"));
}

/**
 * The admin log-in: like signIn, but only for staff (the role in
 * `profile`, not the token), and `next` must be an admin page (else the
 * dashboard). A member's session is ended at once. Staff with two-factor
 * get `needsTwoFactor`; staff without it go on to the panel, which sends
 * them to set it up when it's required.
 */
export async function signInToAdmin(email: unknown, password: unknown, next?: unknown): Promise<SignInResult> {
  const step = await passwordStep(email, password);
  if ("result" in step) return step.result;
  if (!isStaffRole(await profileRole(step.userId))) {
    await step.supabase.auth.signOut({ scope: "local" });
    return { error: "This account doesn't have admin access." };
  }
  if (step.needsTwoFactor) return { needsTwoFactor: true };
  redirect(safeAdminNextPath(typeof next === "string" ? next : null));
}

/**
 * Emails a password-reset code if the account exists. Always ok, and
 * Supabase is asked only after the answer has gone (it sends the email
 * inside the request, so a real account's answer would be slower), so
 * neither the answer nor its timing shows whether an account exists.
 */
export async function requestPasswordReset(email: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  const client = await clientIp();
  if (await limited(LIMITS.emailSend, [client, address], LIMITS.emailSendPerClient)) return RATE_LIMITED;

  after(async () => {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(address);
    if (!error) await newCodeSent("recovery", address);
  });
  return { ok: true };
}

/**
 * Sets a new password with the emailed reset code. The code signs the
 * user in for a moment; once the password is set, every session of the
 * account ends (this one included), so whoever had the old password is
 * out, and the user logs in with the new one. If the new password is
 * refused, that session ends too.
 *
 * The password is set through Auth's admin API, for the account the code
 * belongs to: the code's session is aal1, and Auth refuses a password
 * change from an aal1 session when the account has two-factor
 * (src/lib/auth-hooks.integration.test.ts). The emailed code is what
 * proves the reset, as before; two-factor still guards every sign-in.
 */
export async function resetPassword(email: unknown, code: unknown, newPassword: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return INVALID_CODE;
  const passwordProblem = newPasswordProblem(newPassword);
  if (passwordProblem) return { error: passwordProblem };
  if (await limited(LIMITS.codeCheck, ["recovery", address], LIMITS.codeCheckPerClient)) return RATE_LIMITED;

  const supabase = await createServerSupabase();
  const verified = await supabase.auth.verifyOtp({ email: address, token: code, type: "recovery" });
  if (verified.error) return { error: authErrorMessage(verified.error) };

  const userId = verified.data.user?.id;
  const { error } = userId
    ? await supabaseAdmin().auth.admin.updateUserById(userId, { password: newPassword as string })
    : { error: { code: "unexpected_failure" } };
  if (error) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: `${authErrorMessage(error)} Then request a new code.` };
  }
  await supabase.auth.signOut({ scope: "global" });
  return { ok: true };
}

/** This site's origin, as the browser sees it (for Google's return address). */
async function requestOrigin(): Promise<string> {
  const origin = (await headers()).get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // Not a URL: fall through.
    }
  }
  return siteUrl().origin;
}

/**
 * Starts Google sign-in: sends the browser to Google, which comes back
 * to /auth/callback and then to `next` (a path on this site, else
 * /home). Returns only if it can't start, with the reason.
 */
export async function signInWithGoogle(next: unknown): Promise<{ error: string }> {
  if (typeof next !== "string") return { error: "Google sign-in couldn't start. Please try again." };
  const destination = safeNextPath(next, "/home");
  const callback = `${await requestOrigin()}/auth/callback?${new URLSearchParams({ next: destination })}`;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { error: "Google sign-in isn't available right now." };
  redirect(data.url);
}

/**
 * Signs out this device (other devices stay signed in), then sends the
 * browser to `next` (a path on this site, else /home). Like signIn, the
 * redirect happens here: clearing the cookie re-renders the page being
 * left, and account and admin pages send guests to their log-in pages.
 * Returns only if signing out failed.
 */
export async function signOut(next?: unknown): Promise<{ error: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return { error: authErrorMessage(error) };
  redirect(safeNextPath(typeof next === "string" ? next : null, "/home"));
}
