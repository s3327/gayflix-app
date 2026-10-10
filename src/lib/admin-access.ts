/** How long an admin sign-in lasts before the panel asks for a fresh one. */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type SessionLike =
  | {
      user: { id: string; role?: string | null; twoFactorEnabled?: boolean | null };
      session: { createdAt: Date | string; twoFactorVerified?: boolean | null };
    }
  | null
  | undefined;

/**
 * Whether a session may use the admin panel, and if not, what's missing:
 * - "not-admin": no session, or the account doesn't have the admin role;
 * - "setup-2fa": an admin who hasn't turned on two-factor yet;
 * - "sign-in": an admin whose session didn't pass two-factor (for
 *   example Google sign-in) or is more than 12 hours old.
 *
 * Shared by requireAdmin() and the guard on Better Auth's own admin
 * endpoints (src/lib/auth.ts), so both apply the same rule.
 */
export function adminAccess(
  session: SessionLike,
  now = Date.now()
): "ok" | "not-admin" | "setup-2fa" | "sign-in" {
  if (!session || session.user.role !== "admin") return "not-admin";
  if (!session.user.twoFactorEnabled) return "setup-2fa";
  if (!session.session.twoFactorVerified) return "sign-in";
  const age = now - new Date(session.session.createdAt).getTime();
  return age > ADMIN_SESSION_MAX_AGE_MS ? "sign-in" : "ok";
}
