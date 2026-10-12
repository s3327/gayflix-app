"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  const sessions = await auth.api.listSessions({ headers: requestHeaders });
  const device = sessions.find((s) => s.id === sessionId);
  // Already signed out (another tab, or it expired): nothing left to do.
  if (device) {
    await auth.api.revokeSession({ body: { token: device.token }, headers: requestHeaders });
  }
  revalidatePath("/account/setting");
}

/** Signs out every device but this one. */
export async function signOutOtherDevices(): Promise<void> {
  await requireSession();
  await auth.api.revokeOtherSessions({ headers: await headers() });
  revalidatePath("/account/setting");
}
