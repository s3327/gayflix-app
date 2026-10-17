import type { Metadata } from "next";
import Link from "next/link";
import { Download, Layers, List } from "lucide-react";
import Pagination from "@/components/Pagination";
import ReportTriageView, { type ReportGroup } from "@/components/admin/ReportTriageView";
import { reopenReport, resolveReport } from "@/lib/admin-report-actions";
import { findEpisodeIds } from "@/lib/catalog";
import { db } from "@/lib/db";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Reports",
};

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
 * /admin/reports: player issue submissions with triage view,
 * resolve-all, notes, and resolver tracking.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const showResolved = firstParam(params.status) === "resolved";
  const viewMode = firstParam(params.view) ?? "list";
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
    include: { user: { select: { id: true, email: true } } },
  });

  const allMediaIds = reports.map((report) => report.mediaId);
  const episodeIds = await findEpisodeIds(allMediaIds);
  const nonEpisodeMediaIds = allMediaIds.filter((id) => !episodeIds.has(id));
  const mediaRows =
    nonEpisodeMediaIds.length > 0
      ? await db.media.findMany({
          where: { id: { in: nonEpisodeMediaIds } },
          select: { id: true, type: true },
        })
      : [];
  const mediaTypeMap = new Map(mediaRows.map((m) => [m.id, m.type]));

  const adminEditHref = (mediaId: string) => {
    if (episodeIds.has(mediaId)) return `/admin/library/episodes/${mediaId}`;
    const mediaType = mediaTypeMap.get(mediaId);
    if (mediaType === "series") return `/admin/library/series/${mediaId}`;
    return `/admin/library/movies/${mediaId}`;
  };

  // Group open reports for Triage view
  const groupMap = new Map<string, ReportGroup>();
  if (!showResolved) {
    for (const report of reports) {
      const key = `${report.mediaId}::${report.reason}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.count++;
        if (report.details) existing.detailsList.push(report.details);
        existing.reportIds.push(report.id);
      } else {
        groupMap.set(key, {
          mediaId: report.mediaId,
          mediaTitle: report.mediaTitle,
          mediaType: episodeIds.has(report.mediaId)
            ? "episode"
            : (mediaTypeMap.get(report.mediaId) ?? "movie"),
          reason: report.reason,
          count: 1,
          latestAt: when(report.createdAt),
          detailsList: report.details ? [report.details] : [],
          reportIds: [report.id],
          sources: [],
        });
      }
    }
  }
  const reportGroups = Array.from(groupMap.values());

  // The sources a group's "turn off" choice can pick from: that title's or
  // episode's server tabs that are still on.
  if (reportGroups.length > 0) {
    const groupMediaIds = [...new Set(reportGroups.map((group) => group.mediaId))];
    const sources = await db.videoSource.findMany({
      where: {
        enabled: true,
        OR: [{ mediaId: { in: groupMediaIds } }, { episodeId: { in: groupMediaIds } }],
      },
      orderBy: { position: "asc" },
      select: { id: true, label: true, mediaId: true, episodeId: true },
    });
    for (const group of reportGroups) {
      group.sources = sources
        .filter((source) => (source.episodeId ?? source.mediaId) === group.mediaId)
        .map(({ id, label }) => ({ id, label }));
    }
  }

  const tabHref = (resolved: boolean, view = "list") => {
    const qs = new URLSearchParams();
    if (resolved) qs.set("status", "resolved");
    if (!resolved && view === "triage") qs.set("view", "triage");
    const s = qs.toString();
    return s ? `/admin/reports?${s}` : "/admin/reports";
  };

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {openCount === 1 ? "1 open report" : `${openCount} open reports`} from the player&apos;s
            &ldquo;Report an issue&rdquo; button.
          </p>
        </div>

        <a
          href={`/api/admin/export?type=reports${showResolved ? "&status=resolved" : ""}`}
          download
          className="flex items-center gap-1.5 rounded-card border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:border-border-strong hover:text-ink-primary shadow-2xs"
        >
          <Download className="h-3.5 w-3.5 text-brand-pink" />
          Export CSV
        </a>
      </div>

      <nav aria-label="Report views and status" className="mt-6 flex flex-wrap gap-2">
        <Link
          href={tabHref(false, "list")}
          aria-current={!showResolved && viewMode === "list" ? "page" : undefined}
          className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
            !showResolved && viewMode === "list"
              ? "border-brand-pink bg-brand-pink/10 text-ink-brand shadow-2xs"
              : "border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          All Open Reports
        </Link>
        <Link
          href={tabHref(false, "triage")}
          aria-current={!showResolved && viewMode === "triage" ? "page" : undefined}
          className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
            !showResolved && viewMode === "triage"
              ? "border-brand-pink bg-brand-pink/10 text-ink-brand shadow-2xs"
              : "border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Triage Queue ({openCount})
        </Link>
        <Link
          href={tabHref(true, "list")}
          aria-current={showResolved ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
            showResolved
              ? "border-brand-pink bg-brand-pink/10 text-ink-brand shadow-2xs"
              : "border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
          }`}
        >
          Resolved History
        </Link>
      </nav>

      {/* Triage view mode */}
      {!showResolved && viewMode === "triage" && (
        <ReportTriageView groups={reportGroups} adminEditHref={adminEditHref} />
      )}

      {/* List view mode */}
      {(showResolved || viewMode === "list") && (
        <>
          {reports.length === 0 ? (
            <p className="mt-10 text-sm text-ink-secondary">
              {showResolved ? "No resolved reports yet." : "Nothing to look at. No open reports."}
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface shadow-2xs">
              {reports.map((report) => (
                <li key={report.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={adminEditHref(report.mediaId)}
                      className="font-medium text-ink-primary transition-colors hover:text-ink-brand hover:underline"
                    >
                      {report.mediaTitle}
                    </Link>
                    <p className="mt-0.5 text-sm font-semibold text-ink-secondary">{report.reason}</p>
                    {report.details && (
                      <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-secondary">
                        {report.details}
                      </p>
                    )}
                    {report.notes && (
                      <p className="mt-1.5 text-xs text-brand-pink bg-brand-pink/5 rounded px-2 py-1 border border-brand-pink/15">
                        <span className="font-semibold">Resolution note:</span> {report.notes}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-ink-muted">
                      {report.user ? (
                        <Link
                          href={`/admin/users/${report.user.id}`}
                          className="font-medium text-ink-secondary transition-colors hover:text-ink-brand hover:underline"
                        >
                          {report.user.email}
                        </Link>
                      ) : report.userId ? (
                        <span className="text-ink-muted">Deleted account</span>
                      ) : (
                        "Guest"
                      )}{" "}
                      · {when(report.createdAt)}
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
              makeHref={(p) =>
                `/admin/reports?${showResolved ? "status=resolved&" : "view=list&"}page=${p}`
              }
            />
          )}
        </>
      )}
    </div>
  );
}
