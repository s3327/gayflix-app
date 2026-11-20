"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";
import { isStaffRole } from "@/lib/admin-roles";
import { auth } from "@/lib/auth";
import { LIMITS, overLimit, TOO_MANY_ATTEMPTS } from "@/lib/auth-rate-limit";
import { db } from "@/lib/db";
import { getSession, getVerifiedSession } from "@/lib/session";
import { checkPassword } from "@/lib/supabase/password-check";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientIp } from "@/lib/visitor";

const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";

/*
 * Server functions behind the signed-in devices and turning two-factor
 * off on /account/setting.
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
  if (typeof sessionId !== "string" || sessionId === session.sessionId) {
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
      where: { userId: session.user.id, id: { not: session.sessionId } },
    });
  }
  revalidatePath("/account/setting");
}

/**
 * Turns off two-factor sign-in for the signed-in user: removes their
 * TOTP factors from Supabase Auth. Needs their password, re-checked
 * with a throwaway sign-in that leaves this session alone (checkPassword)
 * and limited per account and per client. Staff can't while
 * ADMIN_REQUIRE_2FA is on. The session is refreshed afterwards, so its
 * token stops saying the account has two-factor (`has_totp`).
 */
export async function disableTwoFactorAction(
  password: unknown
): Promise<{ success?: boolean; error?: string }> {
  const session = await getVerifiedSession(); // the staff check needs the current role
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

  const overAccount = await overLimit(LIMITS.passwordRecheck, [session.user.id]);
  const overClient = await overLimit(LIMITS.passwordRecheckPerClient, [await clientIp()]);
  if (overAccount || overClient) return { error: TOO_MANY_ATTEMPTS };

  const checked = await checkPassword(session.user.email, password);
  if (checked === "wrong") return { error: "That password isn't right." };
  if (checked === "error") return { error: SOMETHING_WENT_WRONG };

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
