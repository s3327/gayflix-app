import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/*
 * Who's asking, for guest limits and view counts. Server code only. IP
 * addresses are only ever stored as a keyed hash.
 */

/**
 * The client IP as the hosting platform reports it. On Vercel both
 * headers are set by the platform, not taken from the visitor.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * The key for keyedHash: HASH_SECRET (server-only, never NEXT_PUBLIC_).
 * BETTER_AUTH_SECRET was the key before Better Auth went; it's still read
 * while HASH_SECRET isn't set, so hashes stored before the move keep
 * matching. Set HASH_SECRET to that same value (docs/SUPABASE_CUTOVER.md).
 */
function hashSecret(env: Record<string, string | undefined>): string | undefined {
  return [env.HASH_SECRET, env.BETTER_AUTH_SECRET].find((value) => value?.trim());
}

/**
 * An HMAC-SHA256 of `value` keyed with HASH_SECRET, so the value can be
 * matched later but not recovered from the hash.
 */
export function keyedHash(value: string, env: Record<string, string | undefined> = process.env): string {
  const secret = hashSecret(env);
  if (!secret && env.NODE_ENV === "production") {
    throw new Error("HASH_SECRET is not set");
  }
  return createHmac("sha256", secret ?? "dev-only-secret").update(value).digest("hex");
}
