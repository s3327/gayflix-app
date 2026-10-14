import type { Metadata } from "next";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Film,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { AVAILABLE_JOBS, getSystemHealth, listJobRuns } from "@/lib/scheduled-jobs";
import { requireAdmin } from "@/lib/session";
import JobRunButton from "@/components/admin/JobRunButton";

export const metadata: Metadata = {
  title: "Background Jobs & System Health",
};

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function JobsPage() {
  await requireAdmin();
  const [health, runs] = await Promise.all([getSystemHealth(), listJobRuns(30)]);

  return (
    <div className="space-y-8 p-6 sm:p-10">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Jobs &amp; Health
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Monitor database latency, system health, and trigger scheduled background maintenance tasks.
        </p>
      </div>

      {/* System Health Section */}
      <section aria-labelledby="health-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-ink-brand" />
          <h2 id="health-heading" className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            System &amp; Database Health
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {/* DB Status */}
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-ink-secondary">Database</span>
              <Database className="h-4 w-4 text-ink-secondary" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span
                className={`inline-flex items-center gap-1 text-sm font-semibold ${
                  health.dbStatus === "healthy" ? "text-emerald-400" : "text-status-error"
                }`}
              >
                {health.dbStatus === "healthy" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {health.dbStatus === "healthy" ? "Operational" : "Error"}
              </span>
            </div>
            <span className="mt-1 block text-2xs text-ink-secondary">
              {health.dbLatencyMs >= 0 ? `${health.dbLatencyMs}ms ping` : "Unreachable"}
            </span>
          </div>

          {/* Active Media */}
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-ink-secondary">Active Media</span>
              <Film className="h-4 w-4 text-ink-secondary" />
            </div>
            <div className="mt-2 text-xl font-bold text-ink">{health.totalMedia}</div>
            <span className="mt-1 block text-2xs text-ink-secondary">Movies &amp; series</span>
          </div>

          {/* Users */}
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-ink-secondary">Accounts</span>
              <Users className="h-4 w-4 text-ink-secondary" />
            </div>
            <div className="mt-2 text-xl font-bold text-ink">{health.totalUsers}</div>
            <span className="mt-1 block text-2xs text-ink-secondary">Registered users</span>
          </div>

          {/* Open Reports */}
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-ink-secondary">Open Reports</span>
              <ShieldAlert className="h-4 w-4 text-ink-secondary" />
            </div>
            <div className="mt-2 text-xl font-bold text-ink">{health.totalReports}</div>
            <span className="mt-1 block text-2xs text-ink-secondary">Pending review</span>
          </div>

          {/* Maintenance Mode */}
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-ink-secondary">Maintenance</span>
              <Wrench className="h-4 w-4 text-ink-secondary" />
            </div>
            <div className="mt-2">
              {health.maintenanceMode ? (
                <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-400">
                  Active
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-emerald-400">
                  Normal
                </span>
              )}
            </div>
            <span className="mt-1 block text-2xs text-ink-secondary">
              {health.maintenanceMode ? "Visitors locked out" : "Site accessible"}
            </span>
          </div>

          {/* Environment */}
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wider text-ink-secondary">Environment</span>
              <HardDrive className="h-4 w-4 text-ink-secondary" />
            </div>
            <div className="mt-2 text-sm font-semibold capitalize text-ink">{health.nodeEnv}</div>
            <span className="mt-1 block text-2xs text-ink-secondary">
              {health.registrationOpen ? "Signups open" : "Signups closed"}
            </span>
          </div>
        </div>
      </section>

      {/* Available Scheduled Jobs */}
      <section aria-labelledby="jobs-heading" className="space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-ink-brand" />
          <h2 id="jobs-heading" className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Configured Background Automation
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {AVAILABLE_JOBS.map((job) => (
            <div
              key={job.name}
              className="flex flex-col justify-between rounded-xl border border-border-subtle bg-bg-surface p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">{job.label}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border-subtle bg-bg-elevated px-1.5 py-0.5 text-2xs text-ink-secondary">
                    <Clock className="h-3 w-3" />
                    {job.schedule}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                  {job.description}
                </p>
              </div>

              <div className="mt-5 border-t border-border-subtle pt-3">
                <JobRunButton jobName={job.name} jobLabel={job.label} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Execution History Table */}
      <section aria-labelledby="history-heading" className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-ink-brand" />
          <h2 id="history-heading" className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Job Run History
          </h2>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-bg-surface p-10 text-center">
            <Clock className="mx-auto h-8 w-8 text-ink-secondary/60" />
            <h3 className="mt-3 text-sm font-semibold text-ink">No Job Executions Yet</h3>
            <p className="mt-1 text-xs text-ink-secondary">
              Click &ldquo;Run Now&rdquo; on any scheduled job above to execute it manually.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border-subtle bg-bg-elevated/40 text-2xs font-semibold uppercase tracking-wider text-ink-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3">Job</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Processed</th>
                    <th scope="col" className="px-4 py-3">Duration</th>
                    <th scope="col" className="px-4 py-3">Triggered By</th>
                    <th scope="col" className="px-4 py-3">Executed At (UTC)</th>
                    <th scope="col" className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {runs.map((run) => (
                    <tr key={run.id} className="transition-colors hover:bg-bg-elevated/30">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                        {AVAILABLE_JOBS.find((j) => j.name === run.jobName)?.label ?? run.jobName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${
                            run.status === "success"
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                              : "border-status-error/30 bg-status-error/15 text-status-error"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
                        {run.itemsCount} items
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
                        {run.durationMs}ms
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
                        {run.triggeredBy}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
                        {dateTime.format(new Date(run.startedAt))}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-ink-secondary" title={run.details ?? ""}>
                        {run.details || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
