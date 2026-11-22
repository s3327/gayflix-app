"use server";

import { sql, type Kysely, type Transaction } from "kysely";
import { findReportTitle } from "@/lib/catalog";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import {
  GUEST_REPORT_LIMIT,
  LOGGED_IN_REPORT_LIMIT,
  parseReport,
  startOfUtcDay,
  type ReportAllowance,
} from "@/lib/reports";
import { getSession } from "@/lib/session";
import { countOf } from "@/lib/sql-helpers";
import { clientIp, keyedHash } from "@/lib/visitor";

/*
 * Server functions behind the Report modal. Signed-in users get
 * LOGGED_IN_REPORT_LIMIT reports a day per account; guests get
 * GUEST_REPORT_LIMIT a day per IP address. The IP is stored only as a
 * keyed hash, so the table never holds a raw address.
 */

type Reporter = { userId: string | null; ipHash: string | null; limit: number };

async function currentReporter(): Promise<Reporter> {
  const session = await getSession();
  if (session) return { userId: session.user.id, ipHash: null, limit: LOGGED_IN_REPORT_LIMIT };
  return { userId: null, ipHash: keyedHash(await clientIp()), limit: GUEST_REPORT_LIMIT };
}

function allowance(reporter: Reporter, used: number): ReportAllowance {
  return {
    limit: reporter.limit,
    remaining: Math.max(0, reporter.limit - used),
    isLoggedIn: reporter.userId !== null,
  };
}

export async function reportAllowance(
  executor: Kysely<DB> = database
): Promise<ReportAllowance> {
  const reporter = await currentReporter();
  const startOfDay = startOfUtcDay(new Date());
  let query = executor
    .selectFrom("report")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("createdAt", ">=", startOfDay);
  if (reporter.userId) {
    query = query.where("userId", "=", reporter.userId);
  } else {
    query = query.where("userId", "is", null).where("ipHash", "=", reporter.ipHash);
  }
  const row = await query.executeTakeFirstOrThrow();
  return allowance(reporter, countOf(row));
}

export type ReportResult =
  | { ok: true; allowance: ReportAllowance }
  | { ok: false; error: string; allowance?: ReportAllowance };

export async function submitReport(
  value: unknown,
  executor: Kysely<DB> = database
): Promise<ReportResult> {
  const input = parseReport(value);
  if (!input) return { ok: false, error: "Pick a reason and keep the details under 1,000 characters." };
  // The title is looked up here rather than trusted from the browser.
  const mediaTitle = await findReportTitle(input.mediaId);
  if (!mediaTitle) return { ok: false, error: "We couldn't find that title." };

  const reporter = await currentReporter();

  const runSubmit = async (tx: Kysely<DB> | Transaction<DB>): Promise<ReportResult> => {
    const key = `report:${reporter.userId ?? reporter.ipHash}`;
    await sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`.execute(tx);
    const startOfDay = startOfUtcDay(new Date());
    let countQuery = tx
      .selectFrom("report")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("createdAt", ">=", startOfDay);
    if (reporter.userId) {
      countQuery = countQuery.where("userId", "=", reporter.userId);
    } else {
      countQuery = countQuery.where("userId", "is", null).where("ipHash", "=", reporter.ipHash);
    }
    const row = await countQuery.executeTakeFirstOrThrow();
    const used = countOf(row);
    if (used >= reporter.limit) {
      return {
        ok: false,
        error: "You've used today's reports. Try again tomorrow.",
        allowance: allowance(reporter, used),
      };
    }
    await tx
      .insertInto("report")
      .values({
        userId: reporter.userId,
        ipHash: reporter.ipHash,
        mediaTitle,
        mediaId: input.mediaId,
        reason: input.reason,
        details: input.details ?? null,
      })
      .execute();
    return { ok: true, allowance: allowance(reporter, used + 1) };
  };

  if (executor.isTransaction) {
    return runSubmit(executor);
  }
  return executor.transaction().execute(runSubmit);
}
