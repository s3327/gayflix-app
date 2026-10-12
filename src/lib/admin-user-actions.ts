"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { isUserId, parseBanForm, userActionProblem, type UserAction } from "@/lib/user-admin";

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
  if (!isUserId(userId)) throw new Error("Invalid user");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, emailVerified: true, banned: true, banExpires: true },
  });
  if (!user) throw new Error("No such user");
  const problem = userActionProblem(action, session.user.id, user);
  if (problem) throw new Error(problem);
  return user;
}

function refresh(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Gives the account the admin role. It sets up two-factor at its next admin login. */
export async function makeAdmin(userId: unknown): Promise<void> {
  const user = await allowedTarget("make-admin", userId);
  await auth.api.setRole({ body: { userId: user.id, role: "admin" }, headers: await headers() });
  refresh(user.id);
}

/** Back to a regular account; its sessions keep working on the site. */
export async function removeAdmin(userId: unknown): Promise<void> {
  const user = await allowedTarget("remove-admin", userId);
  await auth.api.setRole({ body: { userId: user.id, role: "user" }, headers: await headers() });
  refresh(user.id);
}

/** Signs the account out everywhere and stops it signing in, for good or for a while. */
export async function banUser(userId: unknown, form: FormData): Promise<void> {
  const user = await allowedTarget("ban", userId);
  const ban = parseBanForm(form);
  if (!ban) throw new Error("Invalid ban");
  await auth.api.banUser({
    body: { userId: user.id, banReason: ban.reason || undefined, banExpiresIn: ban.seconds },
    headers: await headers(),
  });
  refresh(user.id);
}

export async function unbanUser(userId: unknown): Promise<void> {
  const user = await allowedTarget("unban", userId);
  await auth.api.unbanUser({ body: { userId: user.id }, headers: await headers() });
  refresh(user.id);
}

/** Ends every session the account has; it can sign in again. */
export async function signOutEverywhere(userId: unknown): Promise<void> {
  const user = await allowedTarget("sign-out", userId);
  await auth.api.revokeUserSessions({ body: { userId: user.id }, headers: await headers() });
  refresh(user.id);
}
