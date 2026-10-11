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
 * An HMAC-SHA256 of `value` keyed with BETTER_AUTH_SECRET, so the value
 * can be matched later but not recovered from the hash.
 */
export function keyedHash(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is not set");
  }
  return createHmac("sha256", secret ?? "dev-only-secret").update(value).digest("hex");
}
