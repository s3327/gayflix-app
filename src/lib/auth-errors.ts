/**
 * Readable messages for Supabase Auth's errors, for showing in forms.
 * The server actions in src/lib/auth-actions.ts turn every error into
 * one of these, so Supabase's own wording (which can name internals)
 * never reaches the page.
 */

/** The message the before-user-created hook refuses sign-up with (supabase/migrations). */
export const REGISTRATION_CLOSED = "Public registration is currently closed.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match.",
  // Supabase says otp_expired for a wrong code as well as an old one.
  otp_expired: "That code isn't right, or it has expired. Check the email, or send a new code.",
  email_not_confirmed: "Confirm your email first: enter the code we emailed you.",
  over_request_rate_limit: "Too many attempts. Please wait a minute and try again.",
  over_email_send_rate_limit: "We've sent too many emails just now. Please wait a few minutes and try again.",
  weak_password: "Choose a stronger password: at least 8 characters.",
  same_password: "Choose a password different from your current one.",
  user_banned: "This account has been banned.",
  signup_disabled: REGISTRATION_CLOSED,
};

type AuthError = { code?: string; message?: string; status?: number };

/** A readable message for a Supabase Auth error ("" for none). */
export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) return "";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  // The hook's refusal comes back as a 403 without a code of its own.
  if (error.message === REGISTRATION_CLOSED) return REGISTRATION_CLOSED;
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  return "Something went wrong. Please try again.";
}
