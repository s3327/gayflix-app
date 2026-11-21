import { sql, type Kysely, type Transaction } from "kysely";
import { roleChangeProblem, isStaffRole } from "@/lib/admin-roles";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { escapeLike } from "@/lib/search";
import { banFromBannedUntil, isBanned, isUserId, userActionProblem, type UserFilter } from "@/lib/user-admin";

/*
 * The admin Users page's reads and writes on accounts: Supabase Auth's
 * `auth.users` joined to the site's `profile` (role, ban reason). Server
 * code only, and no access checks here: src/lib/admin-users.ts and
 * src/lib/admin-user-actions.ts call requireAdmin() first. Every query
 * is parameterised, and none reads an IP address column. `executor` is
 * for integration tests, which pass their transaction.
 */

/** An account as the Users page shows it and the rules in src/lib/user-admin.ts judge it. */
export type AdminUser = {
  id: string;
  email: string;
  /** The display name in the account's metadata, or null. */
  name: string | null;
  role: string;
  emailVerified: boolean;
  banned: boolean;
  /** When the ban ends, or null for none or a ban until unbanned. */
  banExpires: Date | null;
  /** Why it was banned (`profile.ban_reason`, only admins see it), or null. */
  banReason: string | null;
  createdAt: Date;
  lastSignInAt: Date | null;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  bannedUntil: Date | string | null;
  banReason: string | null;
  createdAt: Date | string;
  lastSignInAt: Date | string | null;
};

const USER_COLUMNS = sql`
  u.id, COALESCE(u.email, '') AS email, NULLIF(btrim(u.raw_user_meta_data->>'name'), '') AS name, p.role,
  u.email_confirmed_at IS NOT NULL AS "emailVerified", u.banned_until AS "bannedUntil",
  p.ban_reason AS "banReason", u.created_at AS "createdAt", u.last_sign_in_at AS "lastSignInAt"
`;

function toUser(row: UserRow, now = Date.now()): AdminUser {
  const date = (value: Date | string | null) => (value === null ? null : new Date(value));
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: row.emailVerified,
    ...banFromBannedUntil(date(row.bannedUntil), now),
    banReason: row.banReason,
    createdAt: new Date(row.createdAt),
    lastSignInAt: date(row.lastSignInAt),
  };
}

function filterCondition(filter: UserFilter) {
  switch (filter) {
    case "admins":
      return sql`p.role = 'admin'`;
    case "banned":
      return sql`u.banned_until > now()`;
    case "unconfirmed":
      return sql`u.email_confirmed_at IS NULL`;
    case "all":
      return sql`TRUE`;
  }
}

/**
 * Accounts matching a name or email search (already normalised; `%`,
 * `_` and `\` match themselves) and a filter, newest first: at most
 * `limit` of them from `offset`, and how many match in all.
 */
export async function searchUsers(
  { search, filter, limit, offset = 0 }: { search: string; filter: UserFilter; limit: number; offset?: number },
  executor: Kysely<DB> = database
): Promise<{ items: AdminUser[]; total: number }> {
  const pattern = `%${escapeLike(search)}%`;
  const where = sql`
    ${filterCondition(filter)}
    AND (${search} = ''
      OR u.email ILIKE ${pattern} ESCAPE '\\'
      OR u.raw_user_meta_data->>'name' ILIKE ${pattern} ESCAPE '\\')
  `;
  const [{ rows }, { rows: counted }] = await Promise.all([
    sql<UserRow>`
      SELECT ${USER_COLUMNS}
      FROM auth.users u JOIN public.profile p ON p.id = u.id
      WHERE ${where}
      ORDER BY u.created_at DESC, u.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(executor),
    sql<{ total: string }>`
      SELECT count(*) AS total FROM auth.users u JOIN public.profile p ON p.id = u.id WHERE ${where}
    `.execute(executor),
  ]);
  const now = Date.now();
  return { items: rows.map((row) => toUser(row, now)), total: Number(counted[0]?.total ?? 0) };
}

/** How many accounts have the admin role. */
export async function countAdmins(executor: Kysely<DB> = database): Promise<number> {
  const row = await executor
    .selectFrom("profile")
    .select((eb) => eb.fn.countAll<string>().as("total"))
    .where("role", "=", "admin")
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

/** How many accounts there are, or how many joined since `since`. */
export async function countAccounts(since?: Date, executor: Kysely<DB> = database): Promise<number> {
  const { rows } = await sql<{ total: string }>`
    SELECT count(*) AS total FROM auth.users WHERE ${since ?? null}::timestamptz IS NULL OR created_at >= ${since ?? null}::timestamptz
  `.execute(executor);
  return Number(rows[0]?.total ?? 0);
}

/** One account, or null when there's none with that id. */
export async function readUserTarget(id: string, executor: Kysely<DB> = database): Promise<AdminUser | null> {
  if (!isUserId(id)) return null;
  const { rows } = await sql<UserRow>`
    SELECT ${USER_COLUMNS} FROM auth.users u JOIN public.profile p ON p.id = u.id WHERE u.id = ${id}::uuid
  `.execute(executor);
  return rows[0] ? toUser(rows[0]) : null;
}

/** The id of the account with this email (any case), or null. */
export async function findAccountByEmail(email: string, executor: Kysely<DB> = database): Promise<string | null> {
  const { rows } = await sql<{ id: string }>`
    SELECT id FROM auth.users WHERE lower(email) = lower(${email}) LIMIT 1
  `.execute(executor);
  return rows[0]?.id ?? null;
}

/** Keeps why an account was banned, for admins only (null clears it). Never in the user's metadata. */
export async function setBanReason(id: string, reason: string | null, executor: Kysely<DB> = database) {
  await executor.updateTable("profile").set({ ban_reason: reason }).where("id", "=", id).execute();
}

/** The two roles that can change roles; the panel always keeps one of them. */
const MANAGES_ROLES = ["owner", "admin"];

export const LAST_ADMIN = "There must always be at least one admin.";

export type RoleChange = { ok: true; previousRole: string } | { ok: false; problem: string };

/**
 * Gives `targetId` the role `newRole` for `actorId`, if the rules allow
 * it right now: who may change whom (src/lib/admin-roles.ts), the
 * panel's rules (src/lib/user-admin.ts, for `action` when given),
 * staff roles only for confirmed, unbanned accounts, and never leaving
 * no Owner or Admin.
 *
 * The check and the update run in one transaction that first locks the
 * profile rows of the actor, the target and every Owner and Admin
 * (SELECT ... FOR UPDATE, in id order so two changes can't deadlock),
 * and judges by the roles it then reads, not the actor's session. So
 * two admins demoting each other at once can't both succeed: the second
 * waits for the first, then finds its actor is no longer an admin.
 */
export async function changeRole(
  change: { actorId: string; targetId: string; newRole: string; action?: "make-admin" | "remove-admin" },
  executor: Kysely<DB> = database
): Promise<RoleChange> {
  if (!isUserId(change.actorId) || !isUserId(change.targetId)) return { ok: false, problem: "Invalid user ID" };
  if (executor.isTransaction) return changeRoleIn(executor as Transaction<DB>, change);
  return executor.transaction().execute((trx) => changeRoleIn(trx, change));
}

async function changeRoleIn(
  trx: Transaction<DB>,
  { actorId, targetId, newRole, action }: Parameters<typeof changeRole>[0]
): Promise<RoleChange> {
  const { rows: locked } = await sql<{ id: string; role: string }>`
    SELECT id, role FROM public.profile
    WHERE role IN ('owner', 'admin') OR id IN (${actorId}::uuid, ${targetId}::uuid)
    ORDER BY id
    FOR UPDATE
  `.execute(trx);
  const actorRole = locked.find((row) => row.id === actorId)?.role ?? null;
  const target = await readUserTarget(targetId, trx);
  if (!target) return { ok: false, problem: "User not found" };
  if (targetId === actorId) return { ok: false, problem: "You cannot change your own role here." };

  const problem =
    roleChangeProblem(actorRole, target.role, newRole) ??
    (action ? userActionProblem(action, actorId, target) : null) ??
    (isStaffRole(newRole) && !target.emailVerified
      ? "This account hasn't confirmed its email yet, so it can't sign in."
      : null) ??
    (isStaffRole(newRole) && isBanned(target) ? "Unban this account first." : null);
  if (problem) return { ok: false, problem };

  if (MANAGES_ROLES.includes(target.role) && !MANAGES_ROLES.includes(newRole)) {
    const others = locked.filter((row) => row.id !== targetId && MANAGES_ROLES.includes(row.role));
    if (others.length === 0) return { ok: false, problem: LAST_ADMIN };
  }

  await trx.updateTable("profile").set({ role: newRole }).where("id", "=", targetId).execute();
  return { ok: true, previousRole: target.role };
}
