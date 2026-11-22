"use server";

import { revalidatePath } from "next/cache";
import { setAdminFlash } from "@/lib/admin-flash";
import { deleteAllAccountSessions } from "@/lib/auth-profile";
import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { banDuration, isUserId, parseBanForm, userActionProblem, type UserAction } from "@/lib/user-admin";
import { changeRole, findAccountByEmail, readUserTarget, setBanReason } from "@/lib/user-admin-store";
import { logActivity } from "@/lib/activity-logger";
import {
  canManageUsers,
  isOwner,
  isStaffRole,
  roleChangeProblem,
  staffTargetProblem,
  type UserRole,
} from "@/lib/admin-roles";

/*
 * Server functions behind /admin/users. Each one checks for an admin
 * itself (a direct POST never runs the panel layout), then checks the
 * change is allowed (src/lib/admin-roles.ts and src/lib/user-admin.ts)
 * before making it: roles in `profile` (src/lib/user-admin-store.ts,
 * checked again under a lock), bans, details and two-factor through
 * Supabase Auth's admin API, sessions by deleting their rows.
 */

const FORBIDDEN = "Forbidden: You do not have permission to manage users.";

/** The account `userId` names, once `action` on it is allowed. */
async function allowedTarget(action: UserAction, userId: unknown) {
  const session = await requireAdmin();
  if (!canManageUsers(session.user.role)) throw new Error(FORBIDDEN);
  if (!isUserId(userId)) throw new Error("Invalid user");
  const user = await readUserTarget(userId);
  if (!user) throw new Error("No such user");
  const problem =
    (action === "make-admin" || action === "remove-admin"
      ? roleChangeProblem(session.user.role, user.role, action === "make-admin" ? "admin" : "user")
      : staffTargetProblem(session.user.role, user.role)) ?? userActionProblem(action, session.user.id, user);
  if (problem) throw new Error(problem);
  return { user, session };
}

function refresh(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Throws when Supabase Auth's admin API refused the change. */
function ensure(result: { error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`Couldn't ${what}: ${result.error.message}`);
}

/**
 * Admin access granted or removed. The change counts for admin access at
 * once (requireAdmin() reads the role from the database), and elsewhere
 * at the account's next token refresh (within the hour).
 */
async function setAdminRole(action: "make-admin" | "remove-admin", userId: unknown) {
  const { user, session } = await allowedTarget(action, userId);
  const newRole = action === "make-admin" ? "admin" : "user";
  const change = await changeRole({ actorId: session.user.id, targetId: user.id, newRole, action });
  if (!change.ok) throw new Error(change.problem);
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.role_change",
    entityType: "user",
    entityId: user.id,
    summary: action === "make-admin" ? `Promoted ${user.email} to Admin` : `Demoted ${user.email} from Admin to Member`,
    details: { previousRole: change.previousRole, newRole },
  });
  refresh(user.id);
}

/** Gives the account the admin role. It sets up two-factor at its next admin login. */
export async function makeAdmin(userId: unknown): Promise<void> {
  await setAdminRole("make-admin", userId);
  await setAdminFlash({ message: "Admin access granted." });
}

/** Back to a regular account; its sessions keep working on the site. */
export async function removeAdmin(userId: unknown): Promise<void> {
  await setAdminRole("remove-admin", userId);
  await setAdminFlash({ message: "Admin access removed." });
}

/** Sets an explicit role for an account (owner, admin, editor, moderator, user). */
export async function setUserRole(userId: unknown, newRoleArg: unknown): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!isUserId(userId)) return { ok: false, message: "Invalid user ID" };
  const role = typeof newRoleArg === "string" ? (newRoleArg.toLowerCase() as UserRole) : undefined;
  if (!role || !["owner", "admin", "editor", "moderator", "user"].includes(role)) {
    return { ok: false, message: "Invalid role specified." };
  }
  const target = await readUserTarget(userId);
  if (!target) return { ok: false, message: "User not found" };
  if (target.id === session.user.id) {
    return { ok: false, message: "You cannot change your own role here." };
  }
  // A quick check against the session's role; changeRole checks it all
  // again with the database's roles, under a lock.
  const problem = roleChangeProblem(session.user.role, target.role, role);
  if (problem) return { ok: false, message: problem };

  const change = await changeRole({ actorId: session.user.id, targetId: target.id, newRole: role });
  if (!change.ok) return { ok: false, message: change.problem };

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.role_change",
    entityType: "user",
    entityId: target.id,
    summary: `Changed role for ${target.email} to ${role}`,
    details: { previousRole: change.previousRole, newRole: role },
  });

  refresh(target.id);
  await setAdminFlash({ message: `Role updated to ${role}.` });
  return { ok: true };
}

/**
 * Stops the account signing in, for good (a 100-year ban) or for a
 * while, and deletes its sessions, so it's out at once wherever access
 * is checked against the database, and everywhere at its next token
 * refresh. The reason stays in `profile` for admins, never in the
 * account's own metadata.
 */
export async function banUser(userId: unknown, form: FormData): Promise<void> {
  const { user, session } = await allowedTarget("ban", userId);
  const ban = parseBanForm(form);
  if (!ban) throw new Error("Invalid ban");
  ensure(
    await supabaseAdmin().auth.admin.updateUserById(user.id, { ban_duration: banDuration(ban.seconds) }),
    "ban this account"
  );
  await deleteAllAccountSessions(user.id);
  await setBanReason(user.id, ban.reason || null);
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.ban",
    entityType: "user",
    entityId: user.id,
    summary: `Banned user ${user.email}${ban.reason ? `: ${ban.reason}` : ""}`,
    details: { reason: ban.reason, seconds: ban.seconds },
  });
  refresh(user.id);
  await setAdminFlash({ message: "Account banned." });
}

export async function unbanUser(userId: unknown): Promise<void> {
  const { user, session } = await allowedTarget("unban", userId);
  ensure(await supabaseAdmin().auth.admin.updateUserById(user.id, { ban_duration: "none" }), "unban this account");
  await setBanReason(user.id, null);
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.unban",
    entityType: "user",
    entityId: user.id,
    summary: `Unbanned user ${user.email}`,
  });
  refresh(user.id);
  await setAdminFlash({ message: "Account unbanned." });
}

/** Ends every session the account has (deletes them); it can sign in again. */
export async function signOutEverywhere(userId: unknown): Promise<void> {
  const { user, session } = await allowedTarget("sign-out", userId);
  await deleteAllAccountSessions(user.id);
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.sign_out",
    entityType: "user",
    entityId: user.id,
    summary: `Revoked all sessions for ${user.email}`,
  });
  refresh(user.id);
  await setAdminFlash({ message: "Signed out of all devices." });
}

/** Updates the account's display name and email, and can confirm its email. */
export async function updateUserDetails(
  userId: unknown,
  form: FormData
): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageUsers(session.user.role)) return { ok: false, message: FORBIDDEN };
  if (!isUserId(userId)) return { ok: false, message: "Invalid user ID" };

  const name = (form.get("name") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const emailVerified = form.get("emailVerified") === "on" || form.get("emailVerified") === "true";

  if (!name || name.length < 1 || name.length > 100) {
    return { ok: false, message: "Name must be between 1 and 100 characters." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "A valid email address is required." };
  }

  const existing = await readUserTarget(userId);
  if (!existing) return { ok: false, message: "User not found" };
  if (existing.id === session.user.id) {
    return { ok: false, message: "Change your own details from your account page." };
  }
  const targetProblem = staffTargetProblem(session.user.role, existing.role);
  if (targetProblem) return { ok: false, message: targetProblem };
  // A staff account's email is its way back in (password reset), so
  // moving it elsewhere would hand the account over.
  if (email !== existing.email && isStaffRole(existing.role) && !isOwner(session.user.role)) {
    return { ok: false, message: "Only the Owner can change a staff account's email." };
  }
  // Supabase Auth can confirm an email but not take a confirmation back.
  if (existing.emailVerified && !emailVerified) {
    return { ok: false, message: "A confirmed email can't be marked unconfirmed." };
  }
  if (email !== existing.email) {
    const owner = await findAccountByEmail(email);
    if (owner && owner !== existing.id) {
      return { ok: false, message: "That email is already registered to another account." };
    }
  }

  // An admin's change of email takes effect at once, without codes.
  const { error } = await supabaseAdmin().auth.admin.updateUserById(existing.id, {
    ...(email !== existing.email ? { email } : {}),
    user_metadata: { name },
    ...(emailVerified && !existing.emailVerified ? { email_confirm: true } : {}),
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "email_exists"
          ? "That email is already registered to another account."
          : "Couldn't update this account. Try again.",
    };
  }

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.update",
    entityType: "user",
    entityId: existing.id,
    summary: `Updated profile details for ${email}`,
    details: { nameChanged: name !== existing.name, emailChanged: email !== existing.email, emailVerified },
  });

  refresh(existing.id);
  await setAdminFlash({ message: "User details updated." });
  return { ok: true, message: "User updated successfully." };
}

/**
 * Removes every two-factor factor the account has, if it's locked out,
 * and deletes its sessions, so no token still claims two-factor it no
 * longer has; it signs in again with its password.
 */
export async function resetUserTwoFactor(userId: unknown): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageUsers(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to reset user 2FA." };
  }
  if (!isUserId(userId)) return { ok: false, message: "Invalid user ID" };

  const target = await readUserTarget(userId);
  if (!target) return { ok: false, message: "User not found" };
  if (target.id === session.user.id) {
    return { ok: false, message: "You can't reset your own two-factor here." };
  }
  const targetProblem = staffTargetProblem(session.user.role, target.role);
  if (targetProblem) return { ok: false, message: targetProblem };

  const admin = supabaseAdmin().auth.admin;
  const { data, error } = await admin.mfa.listFactors({ userId: target.id });
  if (error) return { ok: false, message: "Couldn't reset two-factor. Try again." };
  for (const factor of data.factors) {
    const { error: deleteError } = await admin.mfa.deleteFactor({ id: factor.id, userId: target.id });
    if (deleteError) return { ok: false, message: "Couldn't reset two-factor. Try again." };
  }
  await deleteAllAccountSessions(target.id);

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.2fa_reset",
    entityType: "user",
    entityId: target.id,
    summary: `Reset Two-Factor Authentication for ${target.email}`,
  });

  refresh(target.id);
  await setAdminFlash({ message: "Two-Factor Authentication reset. User will be prompted to re-enroll." });
  return { ok: true, message: "2FA reset successfully." };
}
