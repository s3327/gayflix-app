/*
 * Who may delete their own account (the Delete Account button on
 * /account/setting). The deleteAccount server action
 * (src/lib/account-actions.ts) checks this on every call, since it can
 * be called without the page. Kept free of server imports so it's
 * unit-tested.
 */

import { isStaffRole } from "@/lib/admin-roles";

export type DeletionRequest = {
  role: string | null | undefined;
  /** An admin is signed in as this account from the admin panel. */
  impersonating: boolean;
  /** The account signs in with a password (not only with Google). */
  hasPassword: boolean;
  passwordGiven: boolean;
};

/** Why this account can't be deleted now, or null when it can. */
export function accountDeletionProblem(request: DeletionRequest): string | null {
  if (request.impersonating) {
    return "This account can't be deleted while an admin is signed in as it.";
  }
  // Keeps the admin panel from losing its last admin (or its Owner) by accident.
  if (isStaffRole(request.role)) {
    return "Admin accounts can't be deleted. Ask another admin to remove your admin role first.";
  }
  // A signed-in session alone isn't enough: whoever holds it must know the password.
  if (request.hasPassword && !request.passwordGiven) {
    return "Enter your password to delete your account.";
  }
  return null;
}
