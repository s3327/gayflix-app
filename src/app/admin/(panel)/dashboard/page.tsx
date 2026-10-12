import Link from "next/link";
import { Flag } from "lucide-react";
import Badge from "@/components/Badge";
import { getUserOverview } from "@/lib/admin-users";
import { getCatalogOverview } from "@/lib/catalog";
import { db } from "@/lib/db";
import { formatCount } from "@/lib/format-count";
import type { MediaType } from "@/lib/media";
import { requireAdmin } from "@/lib/session";
import { libraryPath } from "@/lib/title-form";
import { TRENDING_DAYS } from "@/lib/views";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function count(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;
}

function typeName(type: MediaType) {
  return type === "movie" ? "Movie" : "Series";
}

function byType({ movie, series }: Record<MediaType, number>) {
  return `${count(movie, "movie", "movies")} · ${count(series, "series", "series")}`;
}

/**
 * /admin/dashboard, where the panel opens: open reports, the catalog's
 * size, plays and accounts at a glance, then the titles played most in
 * Trending's window and the titles added last.
 */
export default async function DashboardPage() {
  await requireAdmin();
  const [catalog, accounts, openReports] = await Promise.all([
    getCatalogOverview(),
    getUserOverview(),
    db.report.count({ where: { resolvedAt: null } }),
  ]);
  const week = `last ${TRENDING_DAYS} days`;

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-bg-surface px-5 py-4 text-sm">
        <Flag
          aria-hidden
          className={`h-4 w-4 shrink-0 ${openReports > 0 ? "text-status-warning" : "text-ink-muted"}`}
        />
        <p className="flex-1 text-ink-primary">
          {openReports > 0
            ? `${count(openReports, "open report", "open reports")} from the player.`
            : "No open reports from the player."}
        </p>
        {openReports > 0 && (
          <Link href="/admin/reports" className="font-semibold text-ink-brand underline-offset-2 hover:underline">
            Open Reports
          </Link>
        )}
      </div>

      <ul aria-label="At a glance" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Published titles"
          value={catalog.published.movie + catalog.published.series}
          detail={byType(catalog.published)}
        />
        <Stat
          label="Drafts"
          value={catalog.drafts.movie + catalog.drafts.series}
          detail={byType(catalog.drafts)}
        />
        <Stat label={`Plays, ${week}`} value={catalog.plays} detail="Once per person per title a day" />
        <Stat
          label="Accounts"
          value={accounts.total}
          detail={`${formatCount(accounts.joinedThisWeek)} joined in the ${week}`}
        />
      </ul>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={`Most played, ${week}`}>
          {catalog.mostPlayed.length === 0 ? (
            <Empty>Nothing played in the {week}.</Empty>
          ) : (
            <ol>
              {catalog.mostPlayed.map((title, index) => (
                <Row key={title.id}>
                  <span className="w-5 shrink-0 text-ink-muted">{index + 1}</span>
                  <TitleLink {...title} detail={typeName(title.type)} />
                  <span className="shrink-0 text-ink-secondary">{count(title.plays, "play", "plays")}</span>
                </Row>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Recently added">
          {catalog.recentlyAdded.length === 0 ? (
            <Empty>
              No titles yet. Add one from{" "}
              <Link href="/admin/upload/movies" className="text-ink-brand underline underline-offset-2">
                Upload
              </Link>{" "}
              or{" "}
              <Link href="/admin/import" className="text-ink-brand underline underline-offset-2">
                Import
              </Link>
              .
            </Empty>
          ) : (
            <ul>
              {catalog.recentlyAdded.map((title) => (
                <Row key={title.id}>
                  <TitleLink
                    {...title}
                    detail={`${typeName(title.type)} · Added ${date.format(title.createdAt)}`}
                  />
                  <Badge tone={title.status === "published" ? "success" : "neutral"}>
                    {title.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </Row>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** One number in the row of tiles. */
function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <li className="rounded-card border border-border-subtle bg-bg-surface p-5">
      <p className="text-sm text-ink-secondary">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink-primary">{formatCount(value)}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </li>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = `panel-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 font-display text-lg font-semibold">
        {title}
      </h2>
      <div className="overflow-hidden rounded-card border border-border-subtle bg-bg-surface text-sm">
        {children}
      </div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0">
      {children}
    </li>
  );
}

/** A title, linked to its edit page, with a line about it underneath. */
function TitleLink({
  id,
  type,
  title,
  detail,
}: {
  id: string;
  type: MediaType;
  title: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <Link
        href={`${libraryPath(type)}/${id}`}
        className="block truncate font-medium text-ink-primary transition-colors hover:text-ink-brand"
      >
        {title}
      </Link>
      <p className="text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-ink-secondary">{children}</p>;
}
