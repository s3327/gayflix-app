"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorMessage } from "@/lib/auth-errors";
import { LIMITS, overLimit, resetLimit, TOO_MANY_ATTEMPTS } from "@/lib/auth-rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";
import { getPendingTwoFactorSession, getVerifiedSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientIp } from "@/lib/visitor";

/*
 * Two-factor sign-in with an authenticator app (TOTP), through Supabase
 * Auth's MFA API: turning it on (Account → Setting, /admin/setup-2fa)
 * and the code step of signing in (/login, /admin/login). Turning it off
 * is disableTwoFactorAction (src/lib/account-actions.ts). There are no
 * backup codes: members who lose their device ask staff (Decision D1).
 *
 * Every argument comes from the browser, so each is checked here before
 * Supabase is called. Codes are limited per account and per client
 * (src/lib/auth-rate-limit.ts): six digits are a million guesses.
 */

const CODE_PATTERN = /^\d{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTER_CODE = { error: "Enter the 6-digit code from your authenticator app." } as const;
const SIGN_IN_AGAIN = { error: "For your security, log out and log in again, then try once more." } as const;
const RATE_LIMITED = { error: TOO_MANY_ATTEMPTS } as const;
const SOMETHING_WENT_WRONG = { error: "Something went wrong. Please try again." } as const;

/** Counts a code attempt for the account and for the client; true when either is over. */
async function tooManyCodes(userId: string): Promise<boolean> {
  const client = await clientIp();
  const overAccount = await overLimit(LIMITS.totpCheck, [userId]);
  const overClient = await overLimit(LIMITS.totpCheckPerClient, [client]);
  return overAccount || overClient;
}

/** The SVG markup of the QR code (supabase-js hands it over as a data: URL). */
function svgMarkup(qrCode: string): string {
  return qrCode.replace(/^data:image\/svg\+xml;[^,]*,/, "");
}

/**
 * Starts turning on two-factor: a new TOTP factor, not yet verified,
 * with its QR code (SVG markup) and key for the authenticator app. Any
 * setup that was started and never finished is removed first. It only
 * counts once confirmTwoFactorEnrollment checks a first code.
 */
export async function startTwoFactorEnrollment(): Promise<
  { factorId: string; qrSvg: string; secret: string } | { error: string }
> {
  const session = await getVerifiedSession();
  if (!session) return SIGN_IN_AGAIN;
  if (session.hasVerifiedTotp) return { error: "Two-factor sign-in is already on." };

  const supabase = await createServerSupabase();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError || !factors) return SOMETHING_WENT_WRONG;
  for (const factor of factors.all) {
    if (factor.factor_type !== "totp" || factor.status !== "unverified") continue;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return SOMETHING_WENT_WRONG;
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Gayflix" });
  if (error || !data || data.type !== "totp") return { error: authErrorMessage(error) || SOMETHING_WENT_WRONG.error };
  return { factorId: data.id, qrSvg: svgMarkup(data.totp.qr_code), secret: data.totp.secret };
}

/**
 * Finishes turning on two-factor with the first code from the app. The
 * session becomes aal2, and is refreshed so its token says the account
 * has two-factor (`has_totp`).
 */
export async function confirmTwoFactorEnrollment(factorId: unknown, code: unknown): Promise<{ ok: true } | { error: string }> {
  if (typeof factorId !== "string" || !UUID.test(factorId)) {
    return { error: "Start setting up two-factor again." };
  }
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return ENTER_CODE;
  const session = await getVerifiedSession();
  if (!session) return SIGN_IN_AGAIN;
  if (await tooManyCodes(session.user.id)) return RATE_LIMITED;

  const supabase = await createServerSupabase();
  // Supabase only finds factors of the session's own account.
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: authErrorMessage(error) };
  await resetLimit(LIMITS.totpCheck, [session.user.id]);
  await supabase.auth.refreshSession();
  revalidatePath("/account/setting");
  return { ok: true };
}

/**
 * The code step of signing in: checks the code against the account's
 * TOTP factor, which raises the waiting password-only session to aal2,
 * then sends the browser to `next` (a path on this site, else /account).
 * Returns only when the code isn't accepted.
 */
export async function verifyTwoFactor(code: unknown, next?: unknown): Promise<{ error: string }> {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return ENTER_CODE;
  const pending = await getPendingTwoFactorSession();
  if (!pending) return { error: "Your sign-in has ended. Start over and log in again." };
  if (await tooManyCodes(pending.user.id)) return RATE_LIMITED;

  const supabase = await createServerSupabase();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (listError || !factor) return SOMETHING_WENT_WRONG;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: authErrorMessage(error) };
  await resetLimit(LIMITS.totpCheck, [pending.user.id]);
  redirect(safeNextPath(typeof next === "string" ? next : null, "/account"));
}
