import crypto from "node:crypto";

/**
 * Validates the authorization header for scheduled cron endpoints using timing-safe comparison.
 */
export function isAuthorizedCron(
  authHeader: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!authHeader || !secret) return false;
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);

  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}
