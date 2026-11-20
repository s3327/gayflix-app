"use client";

import { adminClient, emailOTPClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth's browser client, for what hasn't moved to Supabase Auth
 * yet (two-factor, account settings, deleting an account). Sign-up,
 * sign-in, email codes, password reset, Google and sign-out are server
 * actions now (src/lib/auth-actions.ts). Talks to /api/auth on the same
 * origin, so no base URL is needed.
 */
export const authClient = createAuthClient({
  // Sign-in forms handle the two-factor step themselves (TwoFactorForm),
  // so the client doesn't redirect anywhere on its own.
  plugins: [emailOTPClient(), adminClient(), twoFactorClient({ onTwoFactorRedirect: () => {} })],
  // The session is read once per page load, not again on every return to
  // the tab: each read is a server call, and visitors switch tabs a lot
  // while watching. Signing in or out in another tab still updates this
  // one (Better Auth tells other tabs through a broadcast channel).
  sessionOptions: { refetchOnWindowFocus: false },
});

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes. Send a new one.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
  PASSWORD_TOO_LONG: "Use at most 128 characters for your password.",
  INVALID_TOKEN: "This reset link is invalid or has expired. Request a new one.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_PASSWORD: "That password isn't right.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account signs in with Google, so it has no password to change.",
  INVALID_CODE: "That code isn't right. Check your authenticator app and try again.",
  INVALID_BACKUP_CODE: "That backup code isn't right, or it has already been used.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many wrong codes. Log in again to get a new try.",
  ACCOUNT_TEMPORARILY_LOCKED: "Too many wrong codes. Two-factor sign-in is locked for 15 minutes.",
  INVALID_TWO_FACTOR_COOKIE: "This sign-in has expired. Log in again.",
  BANNED_USER: "This account has been banned.",
  SESSION_EXPIRED: "For your security, log out and log in again, then try once more.",
};

type AuthError = { code?: string; message?: string; status?: number };

/** A readable message from a Better Auth error, for showing in forms. */
export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) return "";
  // A known code wins: a ban, for one, also comes back as a 403.
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 403) return error.message || "Public registration is currently closed.";
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  return error.message || "Something went wrong. Please try again.";
}
