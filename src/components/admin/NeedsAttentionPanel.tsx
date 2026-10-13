import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { libraryPath } from "@/lib/title-form";
import type { MediaType } from "@/lib/media";

type TriageItem = {
  id: string;
  type: MediaType;
  title: string;
  issues: string[];
};

export default async function NeedsAttentionPanel() {
  const [moviesWithoutVideo, seriesWithoutEpisodes, mediaWithoutPoster, featuredHero] =
    await Promise.all([
      db.media.findMany({
        where: {
          type: "movie",
          status: "published",
          trashedAt: null,
          videoSources: { none: { enabled: true } },
        },
        select: { id: true, title: true, type: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.media.findMany({
        where: {
          type: "series",
          status: "published",
          trashedAt: null,
          episodes: { none: {} },
        },
        select: { id: true, title: true, type: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.media.findMany({
        where: {
          status: "published",
          trashedAt: null,
          OR: [{ posterUrl: "/brand/no-poster.jpg" }, { posterUrl: "" }],
        },
        select: { id: true, title: true, type: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.media.findFirst({
        where: {
          status: "published",
          trashedAt: null,
          featured: true,
        },
        select: { id: true },
      }),
    ]);

  const itemMap = new Map<string, TriageItem>();

  for (const m of moviesWithoutVideo) {
    const existing = itemMap.get(m.id) ?? { id: m.id, type: m.type, title: m.title, issues: [] };
    existing.issues.push("Missing video");
    itemMap.set(m.id, existing);
  }

  for (const s of seriesWithoutEpisodes) {
    const existing = itemMap.get(s.id) ?? { id: s.id, type: s.type, title: s.title, issues: [] };
    existing.issues.push("0 episodes");
    itemMap.set(s.id, existing);
  }

  for (const p of mediaWithoutPoster) {
    const existing = itemMap.get(p.id) ?? { id: p.id, type: p.type, title: p.title, issues: [] };
    if (!existing.issues.includes("Missing poster")) {
      existing.issues.push("Missing poster");
    }
    itemMap.set(p.id, existing);
  }

  const items = Array.from(itemMap.values());
  const hasIssues = items.length > 0 || !featuredHero;

  return (
    <section aria-labelledby="needs-attention-heading" className="mt-8">
      <div className="flex items-center gap-2 pb-3">
        <AlertTriangle
          aria-hidden
          className={`h-5 w-5 ${hasIssues ? "text-status-warning" : "text-ink-muted"}`}
        />
        <h2 id="needs-attention-heading" className="font-display text-lg font-semibold">
          Needs attention
        </h2>
      </div>

      <div className="overflow-hidden rounded-card border border-border-subtle bg-bg-surface text-sm">
        {!hasIssues ? (
          <p className="px-5 py-4 text-ink-secondary">
            Everything looks good — no catalog quality issues found.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {!featuredHero && (
              <li className="flex items-center justify-between gap-3 bg-status-warning/10 px-5 py-3 text-status-warning">
                <span className="font-medium">
                  Missing home hero — no title is currently featured on the home page.
                </span>
                <Link
                  href="/admin/library/movies"
                  className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:text-ink-primary"
                >
                  Feature a title →
                </Link>
              </li>
            )}

            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-bg-elevated/40"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`${libraryPath(item.type)}/${item.id}`}
                    className="block truncate font-medium text-ink-primary hover:text-ink-brand"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {item.type === "series" ? "Series" : "Movie"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.issues.map((issue) => (
                    <span
                      key={issue}
                      className="rounded-md border border-status-warning/40 bg-status-warning/10 px-2 py-0.5 text-xs font-semibold text-status-warning"
                    >
                      {issue}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
