import { db } from "@/lib/db";
import { deviceName } from "@/lib/device-name";

/*
 * "Download my data" (A15): everything the site keeps about an account,
 * as one JSON file, from Account → Setting (/api/account/export). Server
 * code only. It matches the privacy page's list; when a table about a
 * member is added, add it here too. Never secrets: no password hash, no
 * session tokens, no two-factor secret or backup codes.
 */

export const EXPORT_VERSION = 1;

export async function exportAccount(userId: string) {
  const [user, profile, favorites, watchlist, history, lists, ratings, reviews, sessions, titleReports, contentReports] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, email: true, emailVerified: true, createdAt: true, role: true, twoFactorEnabled: true },
      }),
      db.memberProfile.findUnique({ where: { userId }, select: { nickname: true, createdAt: true } }),
      db.favorite.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { entry: true, createdAt: true } }),
      db.watchlistItem.findMany({ where: { userId }, orderBy: { addedAt: "asc" }, select: { entry: true, addedAt: true } }),
      db.watchHistory.findMany({
        where: { userId },
        orderBy: { watchedAt: "desc" },
        select: { entry: true, watchedAt: true, progressSeconds: true, durationSeconds: true },
      }),
      db.mediaList.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          isPublic: true,
          inCommunity: true,
          createdAt: true,
          items: { orderBy: { addedAt: "asc" }, select: { entry: true, addedAt: true } },
        },
      }),
      db.mediaRating.findMany({ where: { userId }, orderBy: { ratedAt: "asc" }, select: { mediaId: true, value: true, ratedAt: true } }),
      db.review.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { mediaId: true, body: true, createdAt: true, updatedAt: true, hiddenAt: true },
      }),
      db.session.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { userAgent: true, createdAt: true, updatedAt: true } }),
      db.report.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { mediaTitle: true, reason: true, details: true, createdAt: true },
      }),
      db.contentReport.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { reviewId: true, listId: true, reason: true, createdAt: true },
      }),
    ]);

  return {
    format: "Gayflix account data",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    account: { ...user, twoFactorEnabled: Boolean(user.twoFactorEnabled) },
    nickname: profile,
    favorites: favorites.map(({ entry, createdAt }) => ({ title: entry, addedAt: createdAt })),
    watchlist: watchlist.map(({ entry, addedAt }) => ({ title: entry, addedAt })),
    history: history.map(({ entry, ...rest }) => ({ title: entry, ...rest })),
    lists: lists.map(({ items, ...list }) => ({
      ...list,
      titles: items.map(({ entry, addedAt }) => ({ title: entry, addedAt })),
    })),
    ratings,
    reviews: reviews.map(({ hiddenAt, ...review }) => ({ ...review, hiddenByModerator: hiddenAt !== null })),
    signedInDevices: sessions.map((session) => ({
      device: deviceName(session.userAgent),
      signedInAt: session.createdAt,
      lastActiveAt: session.updatedAt,
    })),
    reports: { titles: titleReports, reviewsAndLists: contentReports },
  };
}
