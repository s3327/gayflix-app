import Link from "next/link";
import Pagination from "@/components/Pagination";
import { reopenReport, resolveReport } from "@/lib/admin-report-actions";
import { findEpisodeIds } from "@/lib/catalog";
import { db } from "@/lib/db";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

const PER_PAGE = 50;

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function when(date: Date) {
  return `${dateTime.format(date)} UTC`;
}

/**
 * "Report an issue" submissions from the player, newest first. Open
 * reports can be resolved; resolved ones show who closed them and can be
 * reopened.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const showResolved = firstParam(params.status) === "resolved";
  const where = { resolvedAt: showResolved ? { not: null } : null };

  const [total, openCount] = await Promise.all([
    db.report.count({ where }),
    db.report.count({ where: { resolvedAt: null } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pageParam(params.page), totalPages);
  const reports = await db.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    include: { user: { select: { email: true } } },
  });
  // Reports come from the player on /watch/[id] and /episode/[id].
  const episodeIds = await findEpisodeIds(reports.map((report) => report.mediaId));
  const playerHref = (mediaId: string) =>
    episodeIds.has(mediaId) ? `/episode/${mediaId}` : `/watch/${mediaId}`;

  const tabHref = (resolved: boolean) => (resolved ? "/admin/reports?status=resolved" : "/admin/reports");

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Reports</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {openCount === 1 ? "1 open report" : `${openCount} open reports`} from the player&apos;s
        &ldquo;Report an issue&rdquo; button.
      </p>

      <nav aria-label="Report status" className="mt-6 flex gap-2">
        {[false, true].map((resolved) => (
          <Link
            key={String(resolved)}
            href={tabHref(resolved)}
            aria-current={showResolved === resolved ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              showResolved === resolved
                ? "border-brand-pink bg-brand-pink/10 text-ink-brand"
                : "border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
            }`}
          >
            {resolved ? "Resolved" : "Open"}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="mt-10 text-sm text-ink-secondary">
          {showResolved ? "No resolved reports yet." : "Nothing to look at. No open reports."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={playerHref(report.mediaId)}
                  className="font-medium text-ink-primary transition-colors hover:text-ink-brand"
                >
                  {report.mediaTitle}
                </Link>
                <p className="mt-0.5 text-sm font-semibold text-ink-secondary">{report.reason}</p>
                {report.details && (
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-secondary">
                    {report.details}
                  </p>
                )}
                <p className="mt-2 text-xs text-ink-muted">
                  {report.user?.email ?? "Guest"} · {when(report.createdAt)}
                  {report.resolvedAt &&
                    ` · Resolved by ${report.resolvedBy ?? "an admin"} on ${when(report.resolvedAt)}`}
                </p>
              </div>
              <form action={(report.resolvedAt ? reopenReport : resolveReport).bind(null, report.id)}>
                <button
                  type="submit"
                  aria-label={`${report.resolvedAt ? "Reopen" : "Resolve"} report on ${report.mediaTitle}`}
                  className="rounded-card border border-border-strong px-4 py-1.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
                >
                  {report.resolvedAt ? "Reopen" : "Resolve"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          makeHref={(p) => `${tabHref(showResolved)}${showResolved ? "&" : "?"}page=${p}`}
        />
      )}
    </div>
  );
}
