import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/lib/db-types";
import {
  hideReview,
  restoreReview,
  deleteReviewForGood,
  blockList,
  unblockList,
  dismissReports,
} from "@/lib/admin-community-actions";
import {
  resolveReport,
  resolveAllForMedia,
  reopenReport,
} from "@/lib/admin-report-actions";
import {
  deleteReview,
  reportContent,
  saveReview,
  setListInCommunity,
  setNickname,
} from "@/lib/community-actions";
import {
  getCommunityOwner,
  getMyNickname,
  listCommunityLists,
  listTitleReviews,
  memberNicknames,
} from "@/lib/community";
import { reportAllowance, submitReport } from "@/lib/report-actions";
import { withRollback } from "@/test/database";

let mockUserId: string | null = null;
let mockIp = "203.0.113.1";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => (mockUserId ? { user: { id: mockUserId } } : null)),
}));

vi.mock("@/lib/visitor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/visitor")>();
  return {
    ...actual,
    clientIp: vi.fn(async () => mockIp),
  };
});

let mockAdminSession: { user: { id: string; email: string; role?: string | null } } | null = null;
let mockAdminAllowed = true;

vi.mock("@/lib/admin-guard", () => ({
  moderationSession: vi.fn(async () => ({
    session: mockAdminSession,
    allowed: mockAdminAllowed,
  })),
  FORBIDDEN_USERS: "You do not have access.",
}));

vi.mock("@/lib/admin-flash", () => ({
  setAdminFlash: vi.fn(async () => {}),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

vi.mock("@/lib/catalog", () => ({
  findPublishedIds: vi.fn(async (ids: string[]) => new Set(ids)),
  isRatableTitle: vi.fn(async () => true),
  findReportTitle: vi.fn(async (id: string) => `Test Title ${id}`),
}));

async function createTestUser(
  executor: Kysely<DB>,
  email = `test-${randomUUID()}@gayflix.test`
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at)
    VALUES (${id}::uuid, ${email}, ${JSON.stringify({})}::jsonb, now(), now())
  `.execute(executor);
  return id;
}

async function createTestMedia(
  executor: Kysely<DB>,
  id = `media-${randomUUID().slice(0, 8)}`
): Promise<string> {
  await executor
    .insertInto("media")
    .values({
      id,
      title: `Test Media ${id}`,
      type: "movie",
      year: 2024,
      duration: "1h 30m",
      country: "US",
      language: "en",
      posterUrl: "/posters/test.jpg",
      status: "published",
    })
    .execute();
  return id;
}

describe("Community & Reports Kysely integration", () => {
  beforeEach(() => {
    mockUserId = null;
    mockIp = "203.0.113.1";
    mockAdminSession = null;
    mockAdminAllowed = true;
  });

  describe("Reviews", () => {
    it("a hidden review isn't in public reads", async () => {
      await withRollback(async (trx) => {
        const authorId = await createTestUser(trx);
        const viewerId = await createTestUser(trx);
        const adminId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockUserId = authorId;
        const nickResult = await setNickname("MovieCritic", trx);
        expect(nickResult.ok).toBe(true);

        const saveRes = await saveReview(mediaId, "Brilliant masterpiece from start to finish.", undefined, trx);
        expect(saveRes.ok).toBe(true);

        // Guest public read
        mockUserId = null;
        let publicReviews = await listTitleReviews(mediaId, trx);
        expect(publicReviews.reviews).toHaveLength(1);
        expect(publicReviews.reviews[0].body).toBe("Brilliant masterpiece from start to finish.");
        expect(publicReviews.reviews[0].nickname).toBe("MovieCritic");
        expect(publicReviews.total).toBe(1);
        expect(publicReviews.mine).toBeNull();

        // Other signed-in viewer read
        mockUserId = viewerId;
        let viewerReviews = await listTitleReviews(mediaId, trx);
        expect(viewerReviews.reviews).toHaveLength(1);
        expect(viewerReviews.mine).toBeNull();

        // Hide review as moderator
        const reviewId = publicReviews.reviews[0].id;
        mockAdminSession = { user: { id: adminId, email: "mod@gayflix.test", role: "admin" } };
        mockAdminAllowed = true;
        await hideReview(reviewId, trx);

        // Public read after hiding: review is gone
        mockUserId = null;
        publicReviews = await listTitleReviews(mediaId, trx);
        expect(publicReviews.reviews).toHaveLength(0);
        expect(publicReviews.total).toBe(0);

        // Viewer read after hiding: review is gone
        mockUserId = viewerId;
        viewerReviews = await listTitleReviews(mediaId, trx);
        expect(viewerReviews.reviews).toHaveLength(0);
        expect(viewerReviews.total).toBe(0);
        expect(viewerReviews.mine).toBeNull();

        // Author read after hiding: not in public list, but visible in `mine` with hidden=true
        mockUserId = authorId;
        const authorReviews = await listTitleReviews(mediaId, trx);
        expect(authorReviews.reviews).toHaveLength(0);
        expect(authorReviews.total).toBe(0);
        expect(authorReviews.mine).not.toBeNull();
        expect(authorReviews.mine?.hidden).toBe(true);
        expect(authorReviews.mine?.body).toBe("Brilliant masterpiece from start to finish.");

        // Unhide/restore review
        await restoreReview(reviewId, trx);
        publicReviews = await listTitleReviews(mediaId, trx);
        expect(publicReviews.reviews).toHaveLength(1);

        // Delete review for good
        await deleteReviewForGood(reviewId, trx);
        publicReviews = await listTitleReviews(mediaId, trx);
        expect(publicReviews.reviews).toHaveLength(0);
      });
    });

    it("editing a review updates in place and deleteReview removes it", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockUserId = userId;
        await setNickname("Reviewer1", trx);
        await saveReview(mediaId, "First impression", undefined, trx);

        let reviews = await listTitleReviews(mediaId, trx);
        expect(reviews.reviews).toHaveLength(1);
        expect(reviews.reviews[0].body).toBe("First impression");

        // Save again (update)
        await saveReview(mediaId, "Updated impression after rewatch", undefined, trx);
        reviews = await listTitleReviews(mediaId, trx);
        expect(reviews.reviews).toHaveLength(1);
        expect(reviews.reviews[0].body).toBe("Updated impression after rewatch");

        // Delete review
        await deleteReview(mediaId, trx);
        reviews = await listTitleReviews(mediaId, trx);
        expect(reviews.reviews).toHaveLength(0);
      });
    });
  });

  describe("Reports", () => {
    it("a duplicate report is refused", async () => {
      await withRollback(async (trx) => {
        const reporterId = await createTestUser(trx);
        const authorId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockUserId = authorId;
        await setNickname("ReportedAuthor", trx);
        await saveReview(mediaId, "Inappropriate review text", undefined, trx);

        const titleReviews = await listTitleReviews(mediaId, trx);
        const reviewId = titleReviews.reviews[0].id;

        // Reporter reports the review
        mockUserId = reporterId;
        await reportContent({ reviewId }, "spam", trx);

        const reportsAfterFirst = await trx
          .selectFrom("content_report")
          .selectAll()
          .where("userId", "=", reporterId)
          .where("reviewId", "=", reviewId)
          .execute();
        expect(reportsAfterFirst).toHaveLength(1);
        expect(reportsAfterFirst[0].reason).toBe("spam");

        // Duplicate report for the same target by the same reporter
        await reportContent({ reviewId }, "hateful", trx);

        const reportsAfterSecond = await trx
          .selectFrom("content_report")
          .selectAll()
          .where("userId", "=", reporterId)
          .where("reviewId", "=", reviewId)
          .execute();
        // Still only 1 report row exists; duplicate was refused / not duplicated
        expect(reportsAfterSecond).toHaveLength(1);
        expect(reportsAfterSecond[0].reason).toBe("spam");
      });
    });

    it("direct duplicate content report insert violates unique constraint", async () => {
      await withRollback(async (trx) => {
        const reporterId = await createTestUser(trx);
        const authorId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockUserId = authorId;
        await setNickname("UniqueConstraintAuthor", trx);
        await saveReview(mediaId, "Content to be reported twice", undefined, trx);

        const titleReviews = await listTitleReviews(mediaId, trx);
        const reviewId = titleReviews.reviews[0].id;

        await trx
          .insertInto("content_report")
          .values({
            userId: reporterId,
            reviewId,
            reason: "spam",
          })
          .execute();

        // Database unique constraint refuses duplicate insert directly
        await expect(
          trx
            .insertInto("content_report")
            .values({
              userId: reporterId,
              reviewId,
              reason: "other",
            })
            .execute()
        ).rejects.toThrow();
      });
    });

    it("submitReport respects limits and allowance", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockUserId = userId;
        const initial = await reportAllowance(trx);
        expect(initial.isLoggedIn).toBe(true);
        expect(initial.remaining).toBe(initial.limit);

        const result = await submitReport(
          { mediaId, reason: "Video won't play", details: "Playback stops at 12:30" },
          trx
        );
        expect(result.ok).toBe(true);

        const afterReport = await reportAllowance(trx);
        expect(afterReport.remaining).toBe(initial.limit - 1);

        // Check report in DB
        const saved = await trx
          .selectFrom("report")
          .selectAll()
          .where("userId", "=", userId)
          .where("mediaId", "=", mediaId)
          .executeTakeFirst();
        expect(saved).toBeDefined();
        expect(saved?.reason).toBe("Video won't play");
        expect(saved?.mediaTitle).toBe(`Test Title ${mediaId}`);
      });
    });

    it("admin report actions: resolveReport, resolveAllForMedia, reopenReport", async () => {
      await withRollback(async (trx) => {
        const adminId = await createTestUser(trx);
        const reporterId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockAdminSession = { user: { id: adminId, email: "admin@gayflix.test", role: "admin" } };
        mockAdminAllowed = true;

        mockUserId = reporterId;
        const repRes = await submitReport(
          { mediaId, reason: "Audio out of sync", details: "Audio is 2 seconds late" },
          trx
        );
        expect(repRes.ok).toBe(true);

        const reportRow = await trx
          .selectFrom("report")
          .selectAll()
          .where("userId", "=", reporterId)
          .where("mediaId", "=", mediaId)
          .executeTakeFirstOrThrow();

        // Resolve single report
        await resolveReport(reportRow.id, "Fixed the sync", trx);
        let updated = await trx
          .selectFrom("report")
          .selectAll()
          .where("id", "=", reportRow.id)
          .executeTakeFirstOrThrow();
        expect(updated.resolvedAt).not.toBeNull();
        expect(updated.resolvedBy).toBe("admin@gayflix.test");
        expect(updated.notes).toBe("Fixed the sync");

        // Reopen report
        await reopenReport(reportRow.id, undefined, trx);
        updated = await trx
          .selectFrom("report")
          .selectAll()
          .where("id", "=", reportRow.id)
          .executeTakeFirstOrThrow();
        expect(updated.resolvedAt).toBeNull();
        expect(updated.resolvedBy).toBeNull();

        // Resolve all for media
        const bulkRes = await resolveAllForMedia(
          { mediaId, reportIds: [reportRow.id], notes: "Bulk resolved" },
          trx
        );
        expect(bulkRes.ok).toBe(true);
        expect(bulkRes.resolvedCount).toBe(1);

        updated = await trx
          .selectFrom("report")
          .selectAll()
          .where("id", "=", reportRow.id)
          .executeTakeFirstOrThrow();
        expect(updated.resolvedAt).not.toBeNull();
      });
    });
  });

  describe("Nicknames and Community Lists", () => {
    it("setNickname validates uniqueness and getMyNickname retrieves it", async () => {
      await withRollback(async (trx) => {
        const userA = await createTestUser(trx);
        const userB = await createTestUser(trx);

        mockUserId = userA;
        const resA = await setNickname("UniqueUser", trx);
        expect(resA.ok).toBe(true);
        expect(await getMyNickname(trx)).toBe("UniqueUser");

        // Duplicate nickname by userB is refused
        mockUserId = userB;
        const resB = await setNickname("uniqueuser", trx);
        expect(resB.ok).toBe(false);
        if (!resB.ok) {
          expect(resB.error).toBe("Someone already has that nickname. Choose another.");
        }

        // memberNicknames returns map
        const nicks = await memberNicknames([userA, userB], trx);
        expect(nicks.get(userA)).toBe("UniqueUser");
        expect(nicks.has(userB)).toBe(false);
      });
    });

    it("setListInCommunity, blockList, and unblockList", async () => {
      await withRollback(async (trx) => {
        const userId = await createTestUser(trx);
        const adminId = await createTestUser(trx);
        const mediaId = await createTestMedia(trx);

        mockUserId = userId;
        await setNickname("ListCurator", trx);

        const listId = randomUUID();
        await trx
          .insertInto("media_list")
          .values({
            id: listId,
            userId,
            name: "My Awesome List",
            isPublic: true,
            inCommunity: false,
          })
          .execute();

        await trx
          .insertInto("list_item")
          .values({
            listId,
            mediaId,
            entry: JSON.stringify({
              id: mediaId,
              title: "My Favorite",
              type: "movie",
              year: 2024,
              duration: "1h 30m",
            }),
          })
          .execute();

        // Put in community
        const setRes = await setListInCommunity(listId, true, undefined, trx);
        expect(setRes.ok).toBe(true);

        const owner = await getCommunityOwner(listId, trx);
        expect(owner).toBe("ListCurator");

        const listsPage = await listCommunityLists(1, trx);
        expect(listsPage.lists.some((l) => l.id === listId)).toBe(true);

        // Block list as admin
        mockAdminSession = { user: { id: adminId, email: "admin@gayflix.test", role: "admin" } };
        mockAdminAllowed = true;
        await blockList(listId, trx);

        // List is no longer on community lists
        const blockedLists = await listCommunityLists(1, trx);
        expect(blockedLists.lists.some((l) => l.id === listId)).toBe(false);

        // Owner cannot put it back
        mockUserId = userId;
        const reAdd = await setListInCommunity(listId, true, undefined, trx);
        expect(reAdd.ok).toBe(false);
        if (!reAdd.ok) {
          expect(reAdd.error).toBe("A moderator took this list off Community Lists.");
        }

        // Admin unblocks list
        await unblockList(listId, trx);

        // Owner can put it back now
        const unblockedAdd = await setListInCommunity(listId, true, undefined, trx);
        expect(unblockedAdd.ok).toBe(true);

        // Dismiss reports on list
        await dismissReports("list", listId, trx);
      });
    });
  });
});
