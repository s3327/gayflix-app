"use server";

import { findReportTitle } from "@/lib/catalog";
import { db } from "@/lib/db";
import {
  GUEST_REPORT_LIMIT,
  LOGGED_IN_REPORT_LIMIT,
  parseReport,
  startOfUtcDay,
  type ReportAllowance,
} from "@/lib/reports";
import { getSession } from "@/lib/session";
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

function reportsToday(reporter: Reporter) {
  const today = { gte: startOfUtcDay(new Date()) };
  return reporter.userId
    ? { userId: reporter.userId, createdAt: today }
    : { userId: null, ipHash: reporter.ipHash, createdAt: today };
}

function allowance(reporter: Reporter, used: number): ReportAllowance {
  return {
    limit: reporter.limit,
    remaining: Math.max(0, reporter.limit - used),
    isLoggedIn: reporter.userId !== null,
  };
}

export async function reportAllowance(): Promise<ReportAllowance> {
  const reporter = await currentReporter();
  return allowance(reporter, await db.report.count({ where: reportsToday(reporter) }));
}

export type ReportResult =
  | { ok: true; allowance: ReportAllowance }
  | { ok: false; error: string; allowance?: ReportAllowance };

export async function submitReport(value: unknown): Promise<ReportResult> {
  const input = parseReport(value);
  if (!input) return { ok: false, error: "Pick a reason and keep the details under 1,000 characters." };
  // The title is looked up here rather than trusted from the browser.
  const mediaTitle = await findReportTitle(input.mediaId);
  if (!mediaTitle) return { ok: false, error: "We couldn't find that title." };

  const reporter = await currentReporter();
  // One report at a time per account or IP, so parallel requests can't
  // all pass the count before any of them is saved.
  return db.$transaction(async (tx) => {
    const key = `report:${reporter.userId ?? reporter.ipHash}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const used = await tx.report.count({ where: reportsToday(reporter) });
    if (used >= reporter.limit) {
      return {
        ok: false,
        error: "You've used today's reports. Try again tomorrow.",
        allowance: allowance(reporter, used),
      };
    }
    await tx.report.create({
      data: { userId: reporter.userId, ipHash: reporter.ipHash, mediaTitle, ...input },
    });
    return { ok: true, allowance: allowance(reporter, used + 1) };
  });
}
