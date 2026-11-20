import { sql, type Kysely } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What the database says about a signed-in account right now, for
 * getVerifiedSession(): its role (`profile.role`, the source of truth;
 * the token's `user_role` claim can be up to an hour stale), and whether
 * it has a verified TOTP factor in Supabase Auth.
 *
 * Null unless the token's session is still live: its `auth.sessions` row
 * exists (signing out, "sign out other devices" and an admin's "sign out
 * everywhere" delete it) and hasn't passed `not_after`, the account
 * isn't banned (`banned_until` in the future), and it has a profile row.
 * A token stays valid until it expires (up to an hour), so this is what
 * makes a sign-out, ban or role change count at once for admin access.
 *
 * `executor` is for integration tests, which pass their transaction.
 */
export async function readAuthProfile(
  userId: string,
  sessionId: string,
  executor: Kysely<DB> = database
): Promise<{ role: string; hasVerifiedTotp: boolean } | null> {
  if (!UUID.test(userId) || !UUID.test(sessionId)) return null;
  const { rows } = await sql<{ role: string; hasVerifiedTotp: boolean }>`
    SELECT p.role,
           EXISTS (
             SELECT 1 FROM auth.mfa_factors f
             WHERE f.user_id = p.id AND f.factor_type = 'totp' AND f.status = 'verified'
           ) AS "hasVerifiedTotp"
    FROM public.profile p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = ${userId}::uuid
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND EXISTS (
        SELECT 1 FROM auth.sessions s
        WHERE s.id = ${sessionId}::uuid
          AND s.user_id = p.id
          AND (s.not_after IS NULL OR s.not_after > now())
      )
  `.execute(executor);
  return rows[0] ?? null;
}

/** Whether the account has a verified TOTP factor in Supabase Auth. */
export async function hasVerifiedTotpFactor(userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const { rows } = await sql<{ found: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM auth.mfa_factors
      WHERE user_id = ${userId}::uuid AND factor_type = 'totp' AND status = 'verified'
    ) AS found
  `.execute(database);
  return rows[0]?.found ?? false;
}

/**
 * The account's site role (`profile.role`), or null when it has no
 * profile. For the admin log-in, before it keeps a session.
 */
export async function profileRole(userId: string, executor: Kysely<DB> = database): Promise<string | null> {
  if (!UUID.test(userId)) return null;
  const row = await executor.selectFrom("profile").select("role").where("id", "=", userId).executeTakeFirst();
  return row?.role ?? null;
}

/**
 * Whether the account can sign in with a password (it has an `email`
 * identity in Supabase Auth); a Google-only account can't, so it can't
 * turn on two-factor here.
 */
export async function hasPasswordSignIn(userId: string, executor: Kysely<DB> = database): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const { rows } = await sql<{ found: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = ${userId}::uuid AND provider = 'email'
    ) AS found
  `.execute(executor);
  return rows[0]?.found ?? false;
}
