"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";
import { verifyPassword } from "better-auth/crypto";
import { isStaffRole } from "@/lib/admin-roles";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/*
 * Server functions behind the signed-in devices on /account/setting.
 * Each checks the session itself and only touches the signed-in
 * account's own sessions. Session tokens never leave the server: the
 * page names devices by session id, and the token is looked up here.
 */

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  return session;
}

/** Signs out one of the account's other devices. */
export async function signOutDevice(sessionId: unknown): Promise<void> {
  const session = await requireSession();
  if (typeof sessionId !== "string" || sessionId === session.session.id) {
    throw new Error("Invalid device");
  }
  const requestHeaders = await headers();
  try {
    const sessions = await auth.api.listSessions({ headers: requestHeaders });
    const device = sessions.find((s) => s.id === sessionId);
    if (device) {
      await auth.api.revokeSession({ body: { token: device.token }, headers: requestHeaders });
    }
  } catch {
    await connection();
    await db.session.deleteMany({
      where: { id: sessionId, userId: session.user.id },
    });
  }
  revalidatePath("/account/setting");
}

/** Signs out every device but this one. */
export async function signOutOtherDevices(): Promise<void> {
  const session = await requireSession();
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch {
    await connection();
    await db.session.deleteMany({
      where: { userId: session.user.id, id: { not: session.session.id } },
    });
  }
  revalidatePath("/account/setting");
}

/**
 * Turns off two-factor authentication for the signed-in user.
 * Requires their password to prevent unauthorized changes.
 * Avoids session destruction to keep the current session active and avoid cookie desync.
 */
export async function disableTwoFactorAction(
  password: unknown
): Promise<{ success?: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "For your security, log out and log in again, then try once more." };
  }

  if (typeof password !== "string" || !password) {
    return { error: "Enter your password to turn off two-factor." };
  }

  const isStaff = isStaffRole(session.user.role);
  const requireTwoFactor =
    process.env.ADMIN_REQUIRE_2FA === "true" || process.env.ADMIN_REQUIRE_2FA === "1";
  if (isStaff && requireTwoFactor) {
    return { error: "Staff accounts keep two-factor on." };
  }

  await connection();
  const credential = await db.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { password: true },
  });

  if (!credential?.password) {
    return { error: "This account signs in with Google, so it has no password." };
  }

  const isValid = await verifyPassword({
    hash: credential.password,
    password,
  });

  if (!isValid) {
    return { error: "That password isn't right." };
  }

  await db.$transaction([
    db.twoFactor.deleteMany({ where: { userId: session.user.id } }),
    db.user.update({
      where: { id: session.user.id },
      data: { twoFactorEnabled: false },
    }),
  ]);

  revalidatePath("/account/setting");
  return { success: true };
}
