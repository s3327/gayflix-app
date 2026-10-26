import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * One-click unsubscribe links for the new-episode emails (A16):
 * /unsubscribe?u=<user id>&t=<signature>. The signature is an HMAC of the
 * user id with BETTER_AUTH_SECRET, so a link only works for the account
 * it was sent to, and needs no sign-in. Server code only.
 */

const PURPOSE = "unsubscribe:new-episodes:";

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET is not set");
  return value ?? "dev-only-secret";
}

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", secret()).update(PURPOSE + userId).digest("base64url");
}

export function isUnsubscribeToken(userId: unknown, token: unknown): userId is string {
  if (typeof userId !== "string" || typeof token !== "string" || !userId || userId.length > 100) return false;
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function unsubscribeUrl(origin: string, userId: string): string {
  const query = new URLSearchParams({ u: userId, t: unsubscribeToken(userId) });
  return `${origin}/unsubscribe?${query}`;
}
