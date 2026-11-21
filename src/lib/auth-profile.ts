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

/** A signed-in device: one of the account's live sessions in Supabase Auth. */
export type AccountSession = {
  id: string;
  /** The browser that signed in (src/lib/supabase/config.ts forwards it), or null. */
  userAgent: string | null;
  createdAt: Date;
  /** When the session was last renewed (about hourly while it's in use). */
  lastActiveAt: Date;
};

/**
 * The account's live sessions (not past `not_after`), most recently
 * active first. Never the address Supabase saw (`ip`, blanked anyway).
 */
export async function listAccountSessions(
  userId: string,
  executor: Kysely<DB> = database
): Promise<AccountSession[]> {
  if (!UUID.test(userId)) return [];
  const { rows } = await sql<{ id: string; userAgent: string | null; createdAt: Date; lastActiveAt: Date }>`
    SELECT id, user_agent AS "userAgent", created_at AS "createdAt",
           COALESCE(updated_at, created_at) AS "lastActiveAt"
    FROM auth.sessions
    WHERE user_id = ${userId}::uuid AND (not_after IS NULL OR not_after > now())
    ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC
  `.execute(executor);
  return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt), lastActiveAt: new Date(row.lastActiveAt) }));
}

/**
 * Ends one of the account's sessions by deleting its row, only when it
 * belongs to `userId`; its refresh tokens go with it (ON DELETE CASCADE),
 * so the device can't renew, and getVerifiedSession() refuses its token
 * at once. Returns how many sessions were deleted (0 or 1).
 */
export async function deleteAccountSession(
  userId: string,
  sessionId: string,
  executor: Kysely<DB> = database
): Promise<number> {
  if (!UUID.test(userId) || !UUID.test(sessionId)) return 0;
  const result = await sql`
    DELETE FROM auth.sessions WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
  `.execute(executor);
  return Number(result.numAffectedRows ?? 0);
}

export type SignInMethod = "email" | "google";

/** How the account can sign in: with its password ("email"), with Google, or both. */
export async function signInMethods(userId: string, executor: Kysely<DB> = database): Promise<SignInMethod[]> {
  if (!UUID.test(userId)) return [];
  const { rows } = await sql<{ provider: SignInMethod }>`
    SELECT DISTINCT provider FROM auth.identities
    WHERE user_id = ${userId}::uuid AND provider IN ('email', 'google')
    ORDER BY provider
  `.execute(executor);
  return rows.map((row) => row.provider);
}

/** When the account was made (its profile row's `createdAt`), or null without one. */
export async function accountCreatedAt(userId: string, executor: Kysely<DB> = database): Promise<Date | null> {
  if (!UUID.test(userId)) return null;
  const row = await executor.selectFrom("profile").select("createdAt").where("id", "=", userId).executeTakeFirst();
  return row ? new Date(row.createdAt) : null;
}

/**
 * The account's email change waiting for its codes, or null when there's
 * none. With secure email change on, Supabase Auth emails a code to each
 * address and clears each one's token as its code is accepted (checked
 * on the local stack), so a side whose token is gone is already confirmed.
 */
export async function pendingEmailChange(
  userId: string,
  executor: Kysely<DB> = database
): Promise<{ newEmail: string; currentPending: boolean; newPending: boolean } | null> {
  if (!UUID.test(userId)) return null;
  const { rows } = await sql<{ newEmail: string | null; currentPending: boolean; newPending: boolean }>`
    SELECT email_change AS "newEmail",
           COALESCE(email_change_token_current, '') <> '' AS "currentPending",
           COALESCE(email_change_token_new, '') <> '' AS "newPending"
    FROM auth.users WHERE id = ${userId}::uuid
  `.execute(executor);
  const row = rows[0];
  if (!row?.newEmail || (!row.currentPending && !row.newPending)) return null;
  return { newEmail: row.newEmail, currentPending: row.currentPending, newPending: row.newPending };
}
