import type { ExpressionBuilder } from "kysely";
import { connection } from "next/server";
import { findPublishedIds } from "@/lib/catalog";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { db } from "@/lib/db";
import { countOf } from "@/lib/sql-helpers";
import type { FavoriteEntry } from "@/lib/library-types";
import { getSession } from "@/lib/session";

/*
 * Reads for the community (A9): reviews on a title's page, and the
 * lists members put on Community Lists. Server code only. Members are
 * only ever named by their nickname (member_profile), never by their
 * account name or email.
 */

/** A review as a title's page shows it. */
export type ReviewView = {
  id: string;
  nickname: string;
  body: string;
  /** ISO dates. */
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

/** A title's page shows this many reviews, newest first. */
export const REVIEWS_SHOWN = 50;

export type TitleReviews = {
  reviews: ReviewView[];
  /** All the title's visible reviews, beyond those shown. */
  total: number;
  /** The signed-in member's own review, also when a moderator hid it. */
  mine: (ReviewView & { hidden: boolean }) | null;
  /** The signed-in member's nickname; null for guests and members without one. */
  nickname: string | null;
};

/**
 * Members' nicknames (member_profile) by account id. Accounts aren't in
 * the Prisma schema (they're Supabase Auth's), so this is its own read.
 */
export async function memberNicknames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await database
    .selectFrom("member_profile")
    .select(["userId", "nickname"])
    .where("userId", "in", ids)
    .execute();
  return new Map(rows.map((row) => [row.userId, row.nickname]));
}

function toView(
  row: { id: string; body: string; createdAt: Date; updatedAt: Date; userId: string },
  nicknames: Map<string, string>,
  viewerId: string | null
): ReviewView {
  return {
    id: row.id,
    // A review is only saved with a nickname, but one could be left from a removed profile.
    nickname: nicknames.get(row.userId) ?? "A member",
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isMine: row.userId === viewerId,
  };
}

const REVIEW_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  hiddenAt: true,
} as const;

/** The reviews on a (published) title's page, and the viewer's own. */
export async function listTitleReviews(mediaId: string): Promise<TitleReviews> {
  await connection();
  const session = await getSession();
  const viewerId = session?.user.id ?? null;
  const visible = { mediaId, hiddenAt: null };
  const [rows, total, mine, profile] = await Promise.all([
    db.review.findMany({
      where: visible,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: REVIEWS_SHOWN,
      select: REVIEW_SELECT,
    }),
    db.review.count({ where: visible }),
    viewerId
      ? db.review.findUnique({ where: { userId_mediaId: { userId: viewerId, mediaId } }, select: REVIEW_SELECT })
      : null,
    viewerId ? db.memberProfile.findUnique({ where: { userId: viewerId }, select: { nickname: true } }) : null,
  ]);
  const nicknames = await memberNicknames([...rows, ...(mine ? [mine] : [])].map((row) => row.userId));
  return {
    reviews: rows.map((row) => toView(row, nicknames, viewerId)),
    total,
    mine: mine ? { ...toView(mine, nicknames, viewerId), hidden: mine.hiddenAt !== null } : null,
    nickname: profile?.nickname ?? null,
  };
}

/** The signed-in member's nickname, or null. */
export async function getMyNickname(): Promise<string | null> {
  await connection();
  const session = await getSession();
  if (!session) return null;
  const profile = await db.memberProfile.findUnique({
    where: { userId: session.user.id },
    select: { nickname: true },
  });
  return profile?.nickname ?? null;
}

/** A list as Community Lists shows it. */
export type CommunityList = {
  id: string;
  name: string;
  nickname: string;
  /** Its published titles. */
  count: number;
  /** Up to four of them, for the card. */
  covers: FavoriteEntry[];
};

export const COMMUNITY_PAGE_SIZE = 24;

/**
 * Which lists Community Lists may show: shared, put there by their owner,
 * not taken off, and owned by a member with a nickname (the join).
 */
function communityLists() {
  return database
    .selectFrom("media_list as l")
    .innerJoin("member_profile as p", "p.userId", "l.userId")
    .where("l.isPublic", "=", true)
    .where("l.inCommunity", "=", true)
    .where("l.communityBlocked", "=", false);
}

/** The list has at least one title. */
const hasItems = (eb: ExpressionBuilder<DB & { l: DB["media_list"] }, "l">) =>
  eb.exists(eb.selectFrom("list_item as i").select("i.listId").whereRef("i.listId", "=", "l.id"));

/**
 * One page of Community Lists, most recently changed first. Titles that
 * aren't published now are left out, and so are lists left with none.
 */
export async function listCommunityLists(requestedPage: number) {
  await connection();
  const total = countOf(
    await communityLists()
      .where(hasItems)
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow()
  );
  const totalPages = Math.max(1, Math.ceil(total / COMMUNITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const rows = await communityLists()
    .where(hasItems)
    .select(["l.id", "l.name", "p.nickname"])
    .orderBy("l.updatedAt", "desc")
    .orderBy("l.id", "asc")
    .offset((page - 1) * COMMUNITY_PAGE_SIZE)
    .limit(COMMUNITY_PAGE_SIZE)
    .execute();
  const items =
    rows.length === 0
      ? []
      : await database
          .selectFrom("list_item")
          .select(["listId", "mediaId", "entry"])
          .where("listId", "in", rows.map((row) => row.id))
          .orderBy("addedAt", "asc")
          .execute();
  const published = await findPublishedIds(items.map((item) => item.mediaId));
  const lists: CommunityList[] = rows
    .map((row) => {
      const shown = items.filter((item) => item.listId === row.id && published.has(item.mediaId));
      return {
        id: row.id,
        name: row.name,
        nickname: row.nickname,
        count: shown.length,
        covers: shown.slice(0, 4).map((item) => item.entry as FavoriteEntry),
      };
    })
    .filter((list) => list.count > 0);
  return { lists, page, totalPages };
}

/** Who made a list, by nickname, when it's on Community Lists; else null. */
export async function getCommunityOwner(listId: string): Promise<string | null> {
  await connection();
  const list = await communityLists().select("p.nickname").where("l.id", "=", listId).executeTakeFirst();
  return list?.nickname ?? null;
}
