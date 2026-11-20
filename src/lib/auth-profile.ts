import { sql } from "kysely";
import { database } from "@/lib/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What the database says about a signed-in account right now, for
 * getVerifiedSession(): its role (`profile.role`, the source of truth;
 * the token's `user_role` claim can be up to an hour stale), and whether
 * it has a verified TOTP factor in Supabase Auth.
 *
 * Null when there's no profile row (an account that's being deleted).
 */
export async function readAuthProfile(
  userId: string
): Promise<{ role: string; hasVerifiedTotp: boolean } | null> {
  if (!UUID.test(userId)) return null;
  const { rows } = await sql<{ role: string; hasVerifiedTotp: boolean }>`
    SELECT p.role,
           EXISTS (
             SELECT 1 FROM auth.mfa_factors f
             WHERE f.user_id = p.id AND f.factor_type = 'totp' AND f.status = 'verified'
           ) AS "hasVerifiedTotp"
    FROM public.profile p
    WHERE p.id = ${userId}::uuid
  `.execute(database);
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
