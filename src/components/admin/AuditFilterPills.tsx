"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function AuditFilterPills({
  basePath,
  type,
}: {
  basePath: string;
  type: "movie" | "series";
}) {
  const searchParams = useSearchParams();
  const currentAudit = searchParams.get("audit");

  const makeHref = (auditValue: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");
    if (auditValue) {
      nextParams.set("audit", auditValue);
    } else {
      nextParams.delete("audit");
    }
    const qs = nextParams.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const pills = [
    { label: "All Titles", value: null },
    { label: "Missing Video", value: "no-video" },
    { label: "Missing Backdrop", value: "no-backdrop" },
    ...(type === "series" ? [{ label: "Empty Series", value: "empty-series" }] : []),
    { label: "Stale Drafts (>14d)", value: "stale-drafts" },
  ];

  return (
    <div role="region" aria-label="Audit Filters" className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-ink-muted mr-1">Audit:</span>
      {pills.map((p) => {
        const isActive = (currentAudit ?? null) === p.value;
        return (
          <Link
            key={p.label}
            href={makeHref(p.value)}
            className={`rounded-full px-2.5 py-1 font-semibold transition-colors border ${
              isActive
                ? "border-brand-pink bg-brand-pink/10 text-ink-brand shadow-2xs"
                : "border-border-subtle bg-bg-surface text-ink-secondary hover:border-border-strong hover:text-ink-primary"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

