"use server";

import type { Kysely } from "kysely";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-logger";
import { setAdminFlash } from "@/lib/admin-flash";
import { FORBIDDEN_USERS, moderationSession } from "@/lib/admin-guard";
import { database } from "@/lib/database";
import type { DB } from "./db-types";

/*
 * Server functions behind /admin/community: moderating members' reviews
 * and Community lists, and the reports on them. Each one checks for a
 * moderator itself (a direct POST never runs the panel layout). Acting
 * on a review or a list closes its open reports.
 */

const REVIEW_ID = /^[a-z0-9]{20,40}$/;
const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Target = { reviewId: string } | { listId: string };

function requireReviewId(id: unknown): string {
  if (typeof id !== "string" || !REVIEW_ID.test(id)) throw new Error("Invalid review");
  return id;
}

function requireListId(id: unknown): string {
  if (typeof id !== "string" || !LIST_ID.test(id)) throw new Error("Invalid list");
  return id;
}

function getExecutor(val: unknown): Kysely<DB> {
  return typeof val === "object" && val !== null && "selectFrom" in val
    ? (val as Kysely<DB>)
    : database;
}

/** The moderator's session, or null after telling them they can't. */
async function moderator() {
  const { session, allowed } = await moderationSession();
  if (!allowed) {
    await setAdminFlash({ message: FORBIDDEN_USERS });
    return null;
  }
  return session;
}

async function closeReports(target: Target, email: string, executor: Kysely<DB> = database) {
  let query = executor
    .updateTable("content_report")
    .set({ resolvedAt: new Date(), resolvedBy: email })
    .where("resolvedAt", "is", null);

  if ("reviewId" in target) {
    query = query.where("reviewId", "=", target.reviewId);
  } else {
    query = query.where("listId", "=", target.listId);
  }
  await query.execute();
}

async function done(
  session: { user: { id: string; email: string; role?: string | null } },
  action: string,
  target: Target,
  summary: string
) {
  await logActivity({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action,
    entityType: "reviewId" in target ? "review" : "list",
    entityId: "reviewId" in target ? target.reviewId : target.listId,
    summary,
  });
  revalidatePath("/admin/community");
  await setAdminFlash({ message: summary });
}

/** Hides a review from everyone but its author. */
export async function hideReview(
  id: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await moderator();
  if (!session) return;
  const reviewId = requireReviewId(id);
  const executor = getExecutor(executorOrFormData);
  await executor
    .updateTable("review")
    .set({ hiddenAt: new Date(), hiddenBy: session.user.email })
    .where("id", "=", reviewId)
    .where("hiddenAt", "is", null)
    .execute();
  await closeReports({ reviewId }, session.user.email, executor);
  await done(session, "review.hide", { reviewId }, "Review hidden.");
}

/** Shows a hidden review again. */
export async function restoreReview(
  id: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await moderator();
  if (!session) return;
  const reviewId = requireReviewId(id);
  const executor = getExecutor(executorOrFormData);
  await executor
    .updateTable("review")
    .set({ hiddenAt: null, hiddenBy: null })
    .where("id", "=", reviewId)
    .execute();
  await done(session, "review.restore", { reviewId }, "Review shown again.");
}

/** Deletes a review for good, with its reports. */
export async function deleteReviewForGood(
  id: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await moderator();
  if (!session) return;
  const reviewId = requireReviewId(id);
  const executor = getExecutor(executorOrFormData);
  await executor
    .deleteFrom("review")
    .where("id", "=", reviewId)
    .execute();
  await done(session, "review.delete", { reviewId }, "Review deleted.");
}

/** Takes a list off Community Lists; its owner can't put it back. */
export async function blockList(
  id: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await moderator();
  if (!session) return;
  const listId = requireListId(id);
  const executor = getExecutor(executorOrFormData);
  await executor
    .updateTable("media_list")
    .set({ inCommunity: false, communityBlocked: true })
    .where("id", "=", listId)
    .execute();
  await closeReports({ listId }, session.user.email, executor);
  await done(session, "list.block", { listId }, "List taken off Community Lists.");
}

/** Lets a list's owner put it on Community Lists again. */
export async function unblockList(
  id: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await moderator();
  if (!session) return;
  const listId = requireListId(id);
  const executor = getExecutor(executorOrFormData);
  await executor
    .updateTable("media_list")
    .set({ communityBlocked: false })
    .where("id", "=", listId)
    .execute();
  await done(session, "list.unblock", { listId }, "The owner can put the list on Community Lists again.");
}

/** Closes the open reports on a review or a list, leaving it as it is. */
export async function dismissReports(
  kind: unknown,
  id: unknown,
  executorOrFormData?: Kysely<DB> | FormData
): Promise<void> {
  const session = await moderator();
  if (!session) return;
  const target: Target =
    kind === "review" ? { reviewId: requireReviewId(id) } : { listId: requireListId(id) };
  const executor = getExecutor(executorOrFormData);
  await closeReports(target, session.user.email, executor);
  await done(session, "content_report.dismiss", target, "Reports dismissed.");
}
