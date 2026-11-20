import "server-only";
import { sql, type Kysely } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { keyedHash } from "@/lib/visitor";

/*
 * The site's own limits on signing in and on emailed codes (used by
 * src/lib/auth-actions.ts). Every Auth call now comes from this server,
 * so Supabase's per-IP limits see the host's addresses, not the
 * visitor's; without these, nothing would stop password guessing or
 * trying all million 6-digit codes.
 *
 * Counters live in `auth_rate_limit`, one row per key, in fixed windows.
 * A key is a keyed hash of what it counts (client IP, email), so the
 * table never holds a raw IP address or email. AUTH_RATE_LIMIT=off turns
 * every limit off (the e2e server, where every test comes from
 * 127.0.0.1).
 */

export type AuthLimit = { name: string; max: number; windowSeconds: number };

const MINUTE = 60;

export const LIMITS = {
  /** Password attempts for one email from one client. */
  signIn: { name: "sign-in", max: 10, windowSeconds: 15 * MINUTE },
  /** Password attempts from one client, whatever the email (credential stuffing). */
  signInPerClient: { name: "sign-in-client", max: 50, windowSeconds: 15 * MINUTE },
  /**
   * Checks of the code currently emailed to one address (sign-up or
   * recovery), from anywhere. Starts again when a new code is sent; the
   * window is the code's lifetime (otp_expiry, 1 hour).
   */
  codeCheck: { name: "code-check", max: 5, windowSeconds: 60 * MINUTE },
  /** Code checks from one client, whatever the email. */
  codeCheckPerClient: { name: "code-check-client", max: 30, windowSeconds: 15 * MINUTE },
  /** Code emails (resend, password reset) for one email from one client. */
  emailSend: { name: "email-send", max: 5, windowSeconds: 15 * MINUTE },
  /** Code emails from one client, whatever the email. */
  emailSendPerClient: { name: "email-send-client", max: 20, windowSeconds: 60 * MINUTE },
} satisfies Record<string, AuthLimit>;

export const TOO_MANY_ATTEMPTS = "Too many attempts. Try again later.";

function enabled() {
  return process.env.AUTH_RATE_LIMIT !== "off";
}

function limitKey(limit: AuthLimit, parts: string[]) {
  return `${limit.name}:${keyedHash(parts.join("\n"))}`;
}

/**
 * Counts one attempt against `limit` for `parts` (say, the client IP and
 * the email). True when it's over the limit, in which case the caller
 * refuses without calling Supabase.
 */
export async function overLimit(limit: AuthLimit, parts: string[], db: Kysely<DB> = database): Promise<boolean> {
  if (!enabled()) return false;
  const key = limitKey(limit, parts);
  const { rows } = await sql<{ count: number }>`
    INSERT INTO public.auth_rate_limit (key, count, "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limit."windowStart" <= now() - make_interval(secs => ${limit.windowSeconds})
        THEN 1 ELSE auth_rate_limit.count + 1 END,
      "windowStart" = CASE WHEN auth_rate_limit."windowStart" <= now() - make_interval(secs => ${limit.windowSeconds})
        THEN now() ELSE auth_rate_limit."windowStart" END
    RETURNING count
  `.execute(db);
  // Now and then, drop counters whose window ended long ago.
  if (Math.random() < 0.01) {
    await sql`DELETE FROM public.auth_rate_limit WHERE "windowStart" < now() - interval '1 day'`.execute(db);
  }
  return rows[0].count > limit.max;
}

/** Starts `limit` afresh for `parts` (a new code was sent). */
export async function resetLimit(limit: AuthLimit, parts: string[], db: Kysely<DB> = database): Promise<void> {
  if (!enabled()) return;
  await sql`DELETE FROM public.auth_rate_limit WHERE key = ${limitKey(limit, parts)}`.execute(db);
}
