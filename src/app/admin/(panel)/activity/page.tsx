import type { Metadata } from "next";
import Link from "next/link";
import { Search, Download, Activity, Filter } from "lucide-react";
import Pagination from "@/components/Pagination";
import { listActivityLogs } from "@/lib/activity-logger";
import { roleBadgeClass, roleLabel } from "@/lib/admin-roles";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Activity Log",
};

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function actionBadgeClass(action: string) {
  if (action.includes("create") || action.includes("publish")) {
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  }
  if (action.includes("trash") || action.includes("ban") || action.includes("delete")) {
    return "bg-status-error/15 text-status-error border-status-error/30";
  }
  if (action.includes("role") || action.includes("setting")) {
    return "bg-purple-500/15 text-purple-400 border-purple-500/30";
  }
  return "bg-blue-500/15 text-blue-400 border-blue-500/30";
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = pageParam(params.page);
  const actor = firstParam(params.actor) ?? "";
  const action = firstParam(params.action) ?? "";
  const entityType = firstParam(params.entityType) ?? "";

  const { items, totalPages, total } = await listActivityLogs({
    page,
    pageSize: 30,
    actor: actor || undefined,
    action: action || undefined,
    entityType: entityType || undefined,
  });

  const makeHref = (p: number) => {
    const qs = new URLSearchParams();
    if (actor) qs.set("actor", actor);
    if (action) qs.set("action", action);
    if (entityType) qs.set("entityType", entityType);
    if (p !== 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/activity?${s}` : "/admin/activity";
  };

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-brand-pink" />
            Activity Log
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Chronological audit trail of all administrative events, catalog modifications, and security actions.
          </p>
        </div>

        <a
          href="/api/admin/export?type=activity"
          download
          className="flex items-center gap-1.5 rounded-card border border-border-subtle bg-bg-surface px-4 py-2 text-xs font-semibold text-ink-secondary hover:border-border-strong hover:text-ink-primary shadow-2xs transition-colors"
        >
          <Download className="h-4 w-4 text-brand-pink" />
          Export Activity CSV
        </a>
      </div>

      {/* Filter Toolbar */}
      <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            name="actor"
            defaultValue={actor}
            placeholder="Filter by actor email..."
            className="w-full rounded-md border border-border-subtle bg-bg-surface pl-9 pr-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:border-brand-pink focus:outline-hidden"
          />
        </div>

        <select
          name="entityType"
          defaultValue={entityType}
          className="rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs text-ink-primary focus:border-brand-pink focus:outline-hidden"
        >
          <option value="">All Entities</option>
          <option value="media">Movies & Series</option>
          <option value="episode">Episodes</option>
          <option value="user">Users & Staff</option>
          <option value="setting">Site Settings</option>
          <option value="job">Background Jobs</option>
        </select>

        <button
          type="submit"
          className="flex items-center gap-1 rounded-md border border-border-strong bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
        >
          <Filter className="h-3 w-3" />
          Apply Filters
        </button>

        {(actor || action || entityType) && (
          <Link
            href="/admin/activity"
            className="text-xs text-ink-muted hover:text-ink-brand underline ml-1"
          >
            Clear filters
          </Link>
        )}
      </form>

      {/* Audit Log Table */}
      <div className="mt-6 overflow-x-auto rounded-card border border-border-subtle bg-bg-surface shadow-2xs">
        <table className="w-full min-w-[750px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-bg-base text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Timestamp (UTC)</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-ink-muted">
                  No activity log entries found.
                </td>
              </tr>
            ) : (
              items.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3 text-xs text-ink-muted font-mono whitespace-nowrap">
                    {dateTime.format(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs text-ink-primary truncate max-w-[180px]">
                        {log.actorEmail}
                      </span>
                      {log.actorRole && (
                        <span
                          className={`rounded-full px-2 py-0.2 text-2xs font-semibold border ${roleBadgeClass(
                            log.actorRole
                          )}`}
                        >
                          {roleLabel(log.actorRole)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold border font-mono ${actionBadgeClass(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-secondary capitalize">
                    {log.entityType}
                    {log.entityId && (
                      <span className="text-ink-muted font-mono text-2xs block truncate max-w-[120px]">
                        {log.entityId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-primary">
                    {log.summary}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
        <span>Total events: {total}</span>
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} makeHref={makeHref} />
        )}
      </div>
    </div>
  );
}
