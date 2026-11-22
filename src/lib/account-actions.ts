"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountDeletionProblem } from "@/lib/account-deletion";
import { isStaffRole } from "@/lib/admin-roles";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  deleteAccountSession,
  hasPasswordSignIn,
  listAccountSessions,
  pendingEmailChange,
  signInMethods,
  type SignInMethod,
} from "@/lib/auth-profile";
import { type AuthLimit, LIMITS, overLimit, resetLimit, TOO_MANY_ATTEMPTS } from "@/lib/auth-rate-limit";
import { type AppSession, getVerifiedSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyEmailChangeCode } from "@/lib/supabase/email-change";
import { checkPassword } from "@/lib/supabase/password-check";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientIp } from "@/lib/visitor";

/*
 * Server functions behind /account (name, email, password) and
 * /account/setting (signed-in devices, two-factor, deleting the account),
 * on Supabase Auth.
 *
 * Each reads the session fresh (getVerifiedSession(), so a device signed
 * out elsewhere can't act), checks every argument itself, and only
 * touches the signed-in account. Whenever one asks for the password
 * again, it's re-checked with a throwaway sign-in that leaves this
 * session alone (checkPassword), limited per account and per client.
 */

type Result = { ok: true } | { error: string };

const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";
const SIGNED_OUT = "For your security, log out and log in again, then try once more.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_NAME = 100;

async function requireSession(): Promise<AppSession> {
  const session = await getVerifiedSession();
  if (!session) throw new Error("Not signed in");
  return session;
}

/** Counts an attempt against a per-account (or per-address) limit and a per-client one. */
async function limited(perKey: AuthLimit, key: string[], perClient: AuthLimit): Promise<boolean> {
  const overKey = await overLimit(perKey, key);
  const overClient = await overLimit(perClient, [await clientIp()]);
  return overKey || overClient;
}

/** Re-checks the account's password: null when it's right, else what to say. */
async function passwordProblem(session: AppSession, password: string): Promise<string | null> {
  if (await limited(LIMITS.passwordRecheck, [session.user.id], LIMITS.passwordRecheckPerClient)) {
    return TOO_MANY_ATTEMPTS;
  }
  const checked = await checkPassword(session.user.email, password);
  if (checked === "wrong") return "That password isn't right.";
  if (checked === "error") return SOMETHING_WENT_WRONG;
  return null;
}

/** The trimmed email, or null when it isn't one. */
function emailArg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Saves the display name (the account's metadata, where getSession() reads it). */
export async function updateDisplayName(name: unknown): Promise<Result> {
  const displayName = typeof name === "string" ? name.trim() : "";
  if (!displayName) return { error: "Enter your name." };
  if (displayName.length > MAX_NAME) return { error: `Use at most ${MAX_NAME} characters for your name.` };
  const session = await getVerifiedSession();
  if (!session) return { error: SIGNED_OUT };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ data: { name: displayName } });
  if (error) return { error: authErrorMessage(error) };
  // The name in this session's token changes only when it's renewed.
  await supabase.auth.refreshSession();
  return { ok: true };
}

/**
 * Changes the password: needs the current one, then signs out every
 * other device (the page says so), so whoever had the old password is out.
 */
export async function changePassword(current: unknown, next: unknown): Promise<Result> {
  if (typeof current !== "string" || !current) return { error: "Enter your current password." };
  if (typeof next !== "string" || next.length < MIN_PASSWORD) {
    return { error: `Use at least ${MIN_PASSWORD} characters for your password.` };
  }
  if (next.length > MAX_PASSWORD) return { error: `Use at most ${MAX_PASSWORD} characters for your password.` };
  const session = await getVerifiedSession();
  if (!session) return { error: SIGNED_OUT };
  if (!(await hasPasswordSignIn(session.user.id))) {
    return { error: "Your account signs in with Google only, so it has no password to change." };
  }

  const problem = await passwordProblem(session, current);
  if (problem) return { error: problem };

  // An account with two-factor is at aal2 here (getVerifiedSession()), as Auth requires.
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: authErrorMessage(error) };
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  revalidatePath("/account/setting");
  if (signOutError) {
    return {
      error:
        "Your password was changed, but your other devices couldn't be signed out. Use Sign Out All Other Devices on the Setting page to try again.",
    };
  }
  return { ok: true };
}

/**
 * Starts changing the email: Supabase Auth emails a 6-digit code to the
 * current address and another to the new one (secure email change,
 * `double_confirm_changes`), and the email changes once confirmEmailChange
 * gets both. Auth itself insists on both codes, so even a stolen session
 * calling Auth directly can't move the account to a new address alone.
 * The old address is told afterwards (Auth's email_changed notification).
 * Also needs the password when the account has one; a Google-only account
 * has none to give.
 */
export async function requestEmailChange(newEmail: unknown, password?: unknown): Promise<Result> {
  const address = emailArg(newEmail);
  if (!address) return { error: "Enter a valid email address." };
  const session = await getVerifiedSession();
  if (!session) return { error: SIGNED_OUT };
  if (address.toLowerCase() === session.user.email.toLowerCase()) return { error: "That's already your email." };

  if (await hasPasswordSignIn(session.user.id)) {
    if (typeof password !== "string" || !password) return { error: "Enter your password to change your email." };
    const problem = await passwordProblem(session, password);
    if (problem) return { error: problem };
  }
  if (await limited(LIMITS.emailSend, [session.user.id], LIMITS.emailSendPerClient)) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ email: address });
  if (error) return { error: authErrorMessage(error) };
  // New codes went out: their checks start afresh.
  await resetLimit(LIMITS.codeCheck, ["email_change", session.user.email.toLowerCase()]);
  await resetLimit(LIMITS.codeCheck, ["email_change", address.toLowerCase()]);
  return { ok: true };
}

/**
 * Finishes changing the email to `newEmail` with both codes: the one sent
 * to the current address and the one sent to the new address. Each is
 * checked against its own address and limited like every emailed code. A
 * code Auth already accepted (on an earlier try whose other code was
 * wrong) isn't checked again. This session stays as it was, and is
 * renewed so it carries the new email.
 */
export async function confirmEmailChange(
  newEmail: unknown,
  currentCode: unknown,
  newCode: unknown
): Promise<Result> {
  const address = emailArg(newEmail);
  if (!address) return { error: "Enter a valid email address." };
  if (
    typeof currentCode !== "string" ||
    !CODE_PATTERN.test(currentCode) ||
    typeof newCode !== "string" ||
    !CODE_PATTERN.test(newCode)
  ) {
    return { error: "Enter both 6-digit codes: one from each email." };
  }
  const session = await getVerifiedSession();
  if (!session) return { error: SIGNED_OUT };

  const pending = await pendingEmailChange(session.user.id);
  if (!pending || pending.newEmail.toLowerCase() !== address.toLowerCase()) {
    return { error: "That email change has expired. Start again." };
  }

  const checks = [
    { owed: pending.currentPending, email: session.user.email, code: currentCode, name: "current" },
    { owed: pending.newPending, email: address, code: newCode, name: "new" },
  ].filter((check) => check.owed);
  const overClient = await overLimit(LIMITS.codeCheckPerClient, [await clientIp()]);
  let overAddress = false;
  for (const check of checks) {
    if (await overLimit(LIMITS.codeCheck, ["email_change", check.email.toLowerCase()])) overAddress = true;
  }
  if (overClient || overAddress) return { error: TOO_MANY_ATTEMPTS };

  let changedUserId: string | null = null;
  for (const check of checks) {
    const step = await verifyEmailChangeCode(check.email, check.code);
    if ("error" in step) {
      return step.error.code === "otp_expired"
        ? { error: `The code from your ${check.name} email isn't right, or it has expired.` }
        : { error: authErrorMessage(step.error) };
    }
    if ("changed" in step) changedUserId = step.changed;
  }
  if (changedUserId !== session.user.id) return { error: SOMETHING_WENT_WRONG };

  const supabase = await createServerSupabase();
  await supabase.auth.refreshSession();
  return { ok: true };
}

/** A signed-in device, for /account/setting. */
export type Device = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  /** This device: the session whose id is this token's `session_id`. */
  current: boolean;
};

/** Where the account is signed in (its live Supabase Auth sessions). */
export async function listDevices(): Promise<Device[]> {
  const session = await getVerifiedSession();
  if (!session) return [];
  const sessions = await listAccountSessions(session.user.id);
  return sessions.map((s) => ({ ...s, current: s.id === session.sessionId }));
}

/**
 * Signs out one of the account's other devices: deletes that session
 * (only if it's this account's), which ends its refresh tokens with it.
 * This device signs out with Log Out instead.
 */
export async function signOutDevice(sessionId: unknown): Promise<void> {
  const session = await requireSession();
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) throw new Error("Invalid device");
  if (sessionId.toLowerCase() === session.sessionId.toLowerCase()) throw new Error("Invalid device");
  await deleteAccountSession(session.user.id, sessionId);
  revalidatePath("/account/setting");
}

/**
 * Signs out every device but this one. Throws when Supabase couldn't, so
 * the page shows an error instead of the devices it still lists.
 */
export async function signOutOtherDevices(): Promise<void> {
  await requireSession();
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  revalidatePath("/account/setting");
  if (error) throw new Error("Couldn't sign out the other devices");
}

/** How the signed-in account can sign in: with a password ("email"), Google, or both. */
export async function linkedSignInMethods(): Promise<SignInMethod[]> {
  const session = await getVerifiedSession();
  if (!session) return [];
  return signInMethods(session.user.id);
}

/**
 * Deletes the signed-in account, then signs out and sends the browser to
 * /home (returns only when it can't). Staff accounts can't be deleted
 * (accountDeletionProblem); an account with a password must give it,
 * while a Google-only one confirms with the dialog's button.
 */
export async function deleteAccount(password?: unknown): Promise<{ error: string }> {
  const session = await getVerifiedSession();
  if (!session) return { error: SIGNED_OUT };
  const hasPassword = await hasPasswordSignIn(session.user.id);
  const passwordGiven = typeof password === "string" && password.length > 0;
  const problem = accountDeletionProblem({
    role: session.user.role,
    // Supabase Auth has no impersonation.
    impersonating: false,
    hasPassword,
    passwordGiven,
  });
  if (problem) return { error: problem };
  if (hasPassword) {
    const wrong = await passwordProblem(session, password as string);
    if (wrong) return { error: wrong };
  }

  const { error } = await supabaseAdmin().auth.admin.deleteUser(session.user.id);
  if (error) return { error: SOMETHING_WENT_WRONG };
  // Deleting the user ended its sessions; this clears the cookie (Auth's
  // "session not found" answer is ignored by the client).
  const supabase = await createServerSupabase();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/home");
}

/**
 * Turns off two-factor sign-in for the signed-in user: removes their
 * TOTP factors from Supabase Auth. Needs their password (passwordProblem).
 * Staff can't while ADMIN_REQUIRE_2FA is on. The session is refreshed
 * afterwards, so its token stops saying the account has two-factor
 * (`has_totp`).
 */
export async function disableTwoFactorAction(
  password: unknown
): Promise<{ success?: boolean; error?: string }> {
  const session = await getVerifiedSession(); // the staff check needs the current role
  if (!session) return { error: SIGNED_OUT };

  if (typeof password !== "string" || !password) {
    return { error: "Enter your password to turn off two-factor." };
  }

  const isStaff = isStaffRole(session.user.role);
  const requireTwoFactor =
    process.env.ADMIN_REQUIRE_2FA === "true" || process.env.ADMIN_REQUIRE_2FA === "1";
  if (isStaff && requireTwoFactor) {
    return { error: "Staff accounts keep two-factor on." };
  }

  const problem = await passwordProblem(session, password);
  if (problem) return { error: problem };

  // Removing a verified factor needs an aal2 session, which
  // getVerifiedSession() guarantees for an account with two-factor.
  const supabase = await createServerSupabase();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError || !factors) return { error: SOMETHING_WENT_WRONG };
  for (const factor of factors.totp) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return { error: SOMETHING_WENT_WRONG };
  }
  await supabase.auth.refreshSession();

  revalidatePath("/account/setting");
  return { success: true };
}
