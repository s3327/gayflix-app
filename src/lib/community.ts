import { connection } from "next/server";
import { findPublishedIds } from "@/lib/catalog";
import { db } from "@/lib/db";
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

function toView(
  row: { id: string; body: string; createdAt: Date; updatedAt: Date; userId: string; user: { profile: { nickname: string } | null } },
  viewerId: string | null
): ReviewView {
  return {
    id: row.id,
    // A review is only saved with a nickname, but one could be left from a removed profile.
    nickname: row.user.profile?.nickname ?? "A member",
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
  user: { select: { profile: { select: { nickname: true } } } },
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
  return {
    reviews: rows.map((row) => toView(row, viewerId)),
    total,
    mine: mine ? { ...toView(mine, viewerId), hidden: mine.hiddenAt !== null } : null,
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

/** Which lists Community Lists may show: shared, put there by their owner, not taken off. */
export const COMMUNITY_WHERE = {
  isPublic: true,
  inCommunity: true,
  communityBlocked: false,
  user: { profile: { isNot: null } },
} as const;

/**
 * One page of Community Lists, most recently changed first. Titles that
 * aren't published now are left out, and so are lists left with none.
 */
export async function listCommunityLists(requestedPage: number) {
  await connection();
  const total = await db.mediaList.count({ where: { ...COMMUNITY_WHERE, items: { some: {} } } });
  const totalPages = Math.max(1, Math.ceil(total / COMMUNITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const rows = await db.mediaList.findMany({
    where: { ...COMMUNITY_WHERE, items: { some: {} } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * COMMUNITY_PAGE_SIZE,
    take: COMMUNITY_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      user: { select: { profile: { select: { nickname: true } } } },
      items: { orderBy: { addedAt: "asc" }, select: { mediaId: true, entry: true } },
    },
  });
  const published = await findPublishedIds(rows.flatMap((row) => row.items.map((item) => item.mediaId)));
  const lists: CommunityList[] = rows
    .map((row) => {
      const items = row.items.filter((item) => published.has(item.mediaId));
      return {
        id: row.id,
        name: row.name,
        nickname: row.user.profile?.nickname ?? "A member",
        count: items.length,
        covers: items.slice(0, 4).map((item) => item.entry as FavoriteEntry),
      };
    })
    .filter((list) => list.count > 0);
  return { lists, page, totalPages };
}

/** Who made a list, by nickname, when it's on Community Lists; else null. */
export async function getCommunityOwner(listId: string): Promise<string | null> {
  await connection();
  const list = await db.mediaList.findFirst({
    where: { id: listId, ...COMMUNITY_WHERE },
    select: { user: { select: { profile: { select: { nickname: true } } } } },
  });
  return list?.user.profile?.nickname ?? null;
}
