import { db } from "@/lib/db";
import { deviceName } from "@/lib/device-name";

/*
 * Emails on new sign-ins (A14): each account's devices are remembered by
 * name only ("Chrome on Windows", src/lib/device-name.ts), and a sign-in
 * from a name it hasn't used before is worth telling it about. The very
 * first device an account has isn't (that's signing up, or the first
 * sign-in after this shipped). Server code only; called from Better
 * Auth's session hook in src/lib/auth.ts.
 */

/**
 * Notes a new session's device for its account. Returns the device's name
 * when it's new to an account that has signed in elsewhere before, so
 * the caller can email it; null otherwise.
 */
export async function noteSignInDevice(userId: string, userAgent: string | null | undefined): Promise<string | null> {
  const device = deviceName(userAgent);
  const now = new Date();
  const known = await db.signInDevice.updateMany({ where: { userId, device }, data: { lastSeenAt: now } });
  if (known.count > 0) return null;
  const others = await db.signInDevice.count({ where: { userId } });
  // A second sign-in racing this one may add it first: then it's known.
  const created = await db.signInDevice.createMany({
    data: { userId, device, firstSeenAt: now, lastSeenAt: now },
    skipDuplicates: true,
  });
  return created.count > 0 && others > 0 ? device : null;
}
