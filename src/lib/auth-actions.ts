"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeNextPath } from "@/lib/safe-redirect";
import { siteUrl } from "@/lib/site-url";
import { createServerSupabase } from "@/lib/supabase/server";

/*
 * Sign-up, sign-in, email codes, password reset, Google and sign-out,
 * with Supabase Auth. The browser never calls Supabase: the forms call
 * these, and the session lands in the HttpOnly cookie that the server
 * client writes (src/lib/supabase/server.ts).
 *
 * Every argument comes from the browser, so each is checked here before
 * Supabase is called. Errors come back as readable messages
 * (src/lib/auth-errors.ts), never Supabase's own wording.
 */

type Result = { ok: true } | { error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_NAME = 100;

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

/** Creates an account; Supabase emails a 6-digit code to confirm it. */
export async function signUp(email: unknown, password: unknown, name: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  const passwordProblem = newPasswordProblem(password);
  if (passwordProblem) return { error: passwordProblem };
  const displayName = typeof name === "string" ? name.trim() : "";
  if (!displayName) return { error: "Enter your name." };
  if (displayName.length > MAX_NAME) return { error: `Use at most ${MAX_NAME} characters for your name.` };

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
  return error ? { error: authErrorMessage(error) } : { ok: true };
}

/** Confirms the email with the code from sign-up, which signs the user in. */
export async function verifyEmailCode(email: unknown, code: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return INVALID_CODE;

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: address, token: code, type: "signup" });
  return error ? { error: authErrorMessage(error) } : { ok: true };
}

/** Emails a new sign-up code. */
export async function resendEmailCode(email: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resend({ type: "signup", email: address });
  return error ? { error: authErrorMessage(error) } : { ok: true };
}

/**
 * Signs in with email and password, then sends the browser to `next` (a
 * path on this site, else /account). The redirect happens here rather
 * than in the browser: setting the session cookie re-renders the page
 * the form is on, and /login sends signed-in visitors on by itself, so a
 * navigation started in the browser afterwards would race it.
 * - An account whose email was never confirmed gets a fresh code and
 *   `needsEmailCode` (Supabase only says so once the password is right).
 * - An account with two-factor gets `needsTwoFactor`. Until the code
 *   step exists (two-factor moves to Supabase next), the password-only
 *   session is ended at once, so two-factor can't be skipped.
 */
export async function signIn(
  email: unknown,
  password: unknown,
  next?: unknown
): Promise<{ error: string } | { needsEmailCode: true } | { needsTwoFactor: true }> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  if (typeof password !== "string" || !password) return { error: "Enter your password." };
  if (password.length > MAX_PASSWORD) return { error: "That email and password don't match." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (error?.code === "email_not_confirmed") {
    // A failed resend (sent too recently, say) still leaves the
    // verify page's own Resend button.
    await supabase.auth.resend({ type: "signup", email: address });
    return { needsEmailCode: true };
  }
  if (error) return { error: authErrorMessage(error) };

  const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (levels?.nextLevel === "aal2" && levels.currentLevel !== "aal2") {
    await supabase.auth.signOut({ scope: "local" });
    return { needsTwoFactor: true };
  }
  redirect(safeNextPath(typeof next === "string" ? next : null, "/account"));
}

/**
 * Emails a password-reset code if the account exists. Always ok, even
 * when Supabase refuses (it rate-limits per account), so the answer
 * never shows whether an account exists.
 */
export async function requestPasswordReset(email: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;

  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(address);
  return { ok: true };
}

/**
 * Sets a new password with the emailed reset code. The code signs the
 * user in for a moment; once the password is set, every session of the
 * account ends (this one included), so whoever had the old password is
 * out, and the user logs in with the new one. If the new password is
 * refused, that session ends too.
 */
export async function resetPassword(email: unknown, code: unknown, newPassword: unknown): Promise<Result> {
  const address = emailArg(email);
  if (!address) return INVALID_EMAIL;
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return INVALID_CODE;
  const passwordProblem = newPasswordProblem(newPassword);
  if (passwordProblem) return { error: passwordProblem };

  const supabase = await createServerSupabase();
  const verified = await supabase.auth.verifyOtp({ email: address, token: code, type: "recovery" });
  if (verified.error) return { error: authErrorMessage(verified.error) };

  const { error } = await supabase.auth.updateUser({ password: newPassword as string });
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
