import { connection } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { pageWindow } from "@/lib/paginate";
import { escapeLike, normalizeQuery } from "@/lib/search";
import { requireAdmin } from "@/lib/session";
import { isUserId, type UserFilter } from "@/lib/user-admin";
import { trendingSince } from "@/lib/views";

/*
 * Reads for the admin Users page. Server code only, admins only (each
 * function checks), and never at build time (connection()).
 */

export const USERS_PAGE_SIZE = 50;

function filterWhere(filter: UserFilter, now: Date): Prisma.UserWhereInput {
  switch (filter) {
    case "admins":
      return { role: "admin" };
    case "banned":
      return { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: now } }] };
    case "unconfirmed":
      return { emailVerified: false };
    case "all":
      return {};
  }
}

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
  const pattern = escapeLike(search);
  const where: Prisma.UserWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { email: { contains: pattern, mode: "insensitive" } },
              { name: { contains: pattern, mode: "insensitive" } },
            ],
          }
        : {},
      filterWhere(filter, new Date()),
    ],
  };
  const [total, admins] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: { role: "admin" } }),
  ]);
  const { page, totalPages, skip } = pageWindow(total, requestedPage, USERS_PAGE_SIZE);
  const items = await db.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: USERS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      banned: true,
      banExpires: true,
      createdAt: true,
    },
  });
  return { items, page, totalPages, total, admins };
}

/**
 * One account for its page: how it signs in, its sessions still open,
 * and the reports it has sent. Never IP addresses or browser details.
 */
export async function getUserForAdmin(id: string) {
  await requireAdmin();
  await connection();
  if (!isUserId(id)) return null;
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      banned: true,
      banReason: true,
      banExpires: true,
      twoFactorEnabled: true,
      createdAt: true,
      accounts: { select: { providerId: true } },
      _count: { select: { reports: true } },
    },
  });
  if (!user) return null;
  const sessions = await db.session.aggregate({
    where: { userId: id, expiresAt: { gt: now } },
    _count: true,
    _max: { updatedAt: true },
  });
  return {
    ...user,
    signInMethods: [...new Set(user.accounts.map((account) => account.providerId))],
    openSessions: sessions._count,
    lastActive: sessions._max.updatedAt,
  };
}

/** /admin/dashboard: how many accounts there are, and how many joined in the last 7 days. */
export async function getUserOverview() {
  await requireAdmin();
  await connection();
  const weekAgo = new Date(trendingSince(new Date()) + "T00:00:00.000Z");
  const [total, joinedThisWeek] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
  ]);
  return { total, joinedThisWeek };
}
