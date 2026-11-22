import { connection } from "next/server";
import { hasVerifiedTotpFactor, listAccountSessions, signInMethods } from "@/lib/auth-profile";
import { database } from "@/lib/database";
import { pageWindow } from "@/lib/paginate";
import { normalizeQuery } from "@/lib/search";
import { requireAdmin } from "@/lib/session";
import { isUserId, type UserFilter } from "@/lib/user-admin";
import { countAccounts, countAdmins, readUserTarget, searchUsers } from "@/lib/user-admin-store";
import { trendingSince } from "@/lib/views";

/*
 * Reads for the admin Users page, from Supabase Auth's accounts joined
 * to their profiles (src/lib/user-admin-store.ts). Server code only,
 * admins only (each function checks), and never at build time
 * (connection()).
 */

export const USERS_PAGE_SIZE = 50;

/** One page of accounts, newest first, matching a name or email search. */
export async function listUsers({
  page: requestedPage,
  query = "",
  filter,
}: {
  page: number;
  query?: string;
  filter: UserFilter;
}) {
  await requireAdmin();
  await connection();
  const search = normalizeQuery(query);
  // The total first, so a page past the end shows the last one.
  const [{ total }, admins] = await Promise.all([
    searchUsers({ search, filter, limit: 0 }),
    countAdmins(),
  ]);
  const { page, totalPages, skip } = pageWindow(total, requestedPage, USERS_PAGE_SIZE);
  const { items } = await searchUsers({ search, filter, limit: USERS_PAGE_SIZE, offset: skip });
  return { items, page, totalPages, total, admins };
}

/**
 * One account for its page: how it signs in, whether it has two-factor
 * (a verified factor), its sessions still open, and the reports it has
 * sent. Never IP addresses or browser details.
 */
export async function getUserForAdmin(id: string) {
  await requireAdmin();
  await connection();
  if (!isUserId(id)) return null;
  const user = await readUserTarget(id);
  if (!user) return null;
  const [methods, twoFactorEnabled, sessions, reports] = await Promise.all([
    signInMethods(id),
    hasVerifiedTotpFactor(id),
    listAccountSessions(id),
    database
      .selectFrom("report")
      .select((eb) => eb.fn.countAll<string>().as("total"))
      .where("userId", "=", id)
      .executeTakeFirst(),
  ]);
  return {
    ...user,
    signInMethods: methods,
    twoFactorEnabled,
    openSessions: sessions.length,
    // Sessions come most recently active first.
    lastActive: sessions[0]?.lastActiveAt ?? null,
    reportCount: Number(reports?.total ?? 0),
  };
}

/** /admin/dashboard: how many accounts there are, and how many joined in the last 7 days. */
export async function getUserOverview() {
  await requireAdmin();
  await connection();
  const weekAgo = new Date(trendingSince(new Date()) + "T00:00:00.000Z");
  const [total, joinedThisWeek] = await Promise.all([countAccounts(), countAccounts(weekAgo)]);
  return { total, joinedThisWeek };
}
