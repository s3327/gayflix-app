import { isStaffRole } from "@/lib/admin-roles";
import type { AppSession } from "@/lib/session";

/** How long an admin sign-in lasts before the panel asks for a fresh one. */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * When the admin panel's 12 hours started for this session: the last
 * TOTP check for a two-factor (aal2) session, otherwise the sign-in.
 */
export function adminSignInAt(session: AppSession): number | null {
  return session.aal === "aal2" ? session.totpVerifiedAt : session.createdAt;
}

/**
 * Whether a session may use the admin panel, and if not, what's missing:
 * - "not-admin": no session, or the account doesn't have a staff role;
 * - "setup-2fa": a staff member without a verified TOTP factor (when 2FA is required);
 * - "sign-in": a staff member with two-factor whose session didn't pass it
 *   (aal1), or whose last two-factor (or, without two-factor, whose
 *   sign-in) is more than 12 hours old.
 *
 * Pass only sessions from getVerifiedSession() (requireAdmin() does): its
 * role and `hasVerifiedTotp` come from the database.
 *
 * By default, two-factor authentication is optional for staff (admins can sign in
 * with password only). Set ADMIN_REQUIRE_2FA=true to mandate 2FA for all staff.
 */
export function adminAccess(
  session: AppSession | null | undefined,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env
): "ok" | "not-admin" | "setup-2fa" | "sign-in" {
  if (!session || !isStaffRole(session.user.role)) return "not-admin";
  const requireTwoFactor = env.ADMIN_REQUIRE_2FA === "true" || env.ADMIN_REQUIRE_2FA === "1";
  if (requireTwoFactor && !session.hasVerifiedTotp) return "setup-2fa";
  if (session.hasVerifiedTotp && session.aal !== "aal2") return "sign-in";
  const signedInAt = adminSignInAt(session);
  if (signedInAt === null) return "sign-in";
  return now - signedInAt > ADMIN_SESSION_MAX_AGE_MS ? "sign-in" : "ok";
}
