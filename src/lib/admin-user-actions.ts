"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { setAdminFlash } from "@/lib/admin-flash";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { isUserId, parseBanForm, userActionProblem, type UserAction } from "@/lib/user-admin";
import { logActivity } from "@/lib/activity-logger";
import { canManageUsers, isOwner, type UserRole } from "@/lib/admin-roles";

/*
 * Server functions behind /admin/users. Each one checks for an admin
 * itself (a direct POST never runs the panel layout), then checks the
 * change is allowed (src/lib/user-admin.ts) before handing it to Better
 * Auth's admin API, whose own guard (src/lib/auth.ts) checks the session
 * once more.
 */

/** The account `userId` names, once `action` on it is allowed. */
async function allowedTarget(action: UserAction, userId: unknown) {
  const session = await requireAdmin();
  if (!canManageUsers(session.user.role)) {
    throw new Error("Forbidden: You do not have permission to manage users.");
  }
  if (!isUserId(userId)) throw new Error("Invalid user");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, emailVerified: true, banned: true, banExpires: true },
  });
  if (!user) throw new Error("No such user");
  const problem = userActionProblem(action, session.user.id, user);
  if (problem) throw new Error(problem);
  return { user, session };
}

function refresh(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Gives the account the admin role. It sets up two-factor at its next admin login. */
export async function makeAdmin(userId: unknown): Promise<void> {
  const { user, session } = await allowedTarget("make-admin", userId);
  await auth.api.setRole({ body: { userId: user.id, role: "admin" }, headers: await headers() });
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.role_change",
    entityType: "user",
    entityId: user.id,
    summary: `Promoted ${user.email} to Admin`,
    details: { previousRole: user.role, newRole: "admin" },
  });
  refresh(user.id);
  await setAdminFlash({ message: "Admin access granted." });
}

/** Back to a regular account; its sessions keep working on the site. */
export async function removeAdmin(userId: unknown): Promise<void> {
  const { user, session } = await allowedTarget("remove-admin", userId);
  await auth.api.setRole({ body: { userId: user.id, role: "user" }, headers: await headers() });
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.role_change",
    entityType: "user",
    entityId: user.id,
    summary: `Demoted ${user.email} from Admin to Member`,
    details: { previousRole: user.role, newRole: "user" },
  });
  refresh(user.id);
  await setAdminFlash({ message: "Admin access removed." });
}

/** Sets an explicit role for an account (owner, admin, editor, moderator, user). */
export async function setUserRole(userId: unknown, newRoleArg: unknown): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!isUserId(userId)) return { ok: false, message: "Invalid user ID" };
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return { ok: false, message: "User not found" };

  if (target.id === session.user.id) {
    return { ok: false, message: "You cannot change your own role here." };
  }

  // Owner protection
  if (target.role === "owner" && !isOwner(session.user.role)) {
    return { ok: false, message: "Only the Owner can transfer ownership or modify the Owner account." };
  }

  const role = String(newRoleArg).toLowerCase() as UserRole;
  if (!["owner", "admin", "editor", "moderator", "user"].includes(role)) {
    return { ok: false, message: "Invalid role specified." };
  }

  if (role === "owner" && !isOwner(session.user.role)) {
    return { ok: false, message: "Only the current Owner can transfer ownership." };
  }

  await db.user.update({
    where: { id: target.id },
    data: { role },
  });

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.role_change",
    entityType: "user",
    entityId: target.id,
    summary: `Changed role for ${target.email} to ${role}`,
    details: { previousRole: target.role, newRole: role },
  });

  refresh(target.id);
  await setAdminFlash({ message: `Role updated to ${role}.` });
  return { ok: true };
}

/** Signs the account out everywhere and stops it signing in, for good or for a while. */
export async function banUser(userId: unknown, form: FormData): Promise<void> {
  const { user, session } = await allowedTarget("ban", userId);
  const ban = parseBanForm(form);
  if (!ban) throw new Error("Invalid ban");
  await auth.api.banUser({
    body: { userId: user.id, banReason: ban.reason || undefined, banExpiresIn: ban.seconds },
    headers: await headers(),
  });
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
  await auth.api.unbanUser({ body: { userId: user.id }, headers: await headers() });
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

/** Ends every session the account has; it can sign in again. */
export async function signOutEverywhere(userId: unknown): Promise<void> {
  const { user, session } = await allowedTarget("sign-out", userId);
  await auth.api.revokeUserSessions({ body: { userId: user.id }, headers: await headers() });
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

/** Updates user's name, email, and emailVerified status. */
export async function updateUserDetails(
  userId: unknown,
  form: FormData
): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageUsers(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to manage users." };
  }
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

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
  if (!existing) return { ok: false, message: "User not found" };

  // Check email uniqueness if changing email
  if (email !== existing.email) {
    const conflict = await db.user.findUnique({ where: { email } });
    if (conflict && conflict.id !== userId) {
      return { ok: false, message: "That email is already registered to another account." };
    }
  }

  await db.user.update({
    where: { id: userId },
    data: { name, email, emailVerified },
  });

  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: "user.update",
    entityType: "user",
    entityId: userId,
    summary: `Updated profile details for ${email}`,
    details: { nameChanged: name !== existing.name, emailChanged: email !== existing.email, emailVerified },
  });

  refresh(userId);
  await setAdminFlash({ message: "User details updated." });
  return { ok: true, message: "User updated successfully." };
}

/** Resets 2FA for a user account if locked out (Owner/Admin only). */
export async function resetUserTwoFactor(userId: unknown): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdmin();
  if (!canManageUsers(session.user.role)) {
    return { ok: false, message: "Forbidden: You do not have permission to reset user 2FA." };
  }
  if (!isUserId(userId)) return { ok: false, message: "Invalid user ID" };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return { ok: false, message: "User not found" };

  if (target.role === "owner" && !isOwner(session.user.role)) {
    return { ok: false, message: "Only the Owner can reset 2FA on the Owner account." };
  }

  await db.$transaction([
    db.twoFactor.deleteMany({ where: { userId: target.id } }),
    db.user.update({ where: { id: target.id }, data: { twoFactorEnabled: false } }),
  ]);

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
