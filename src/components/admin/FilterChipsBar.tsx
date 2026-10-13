"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

export default function FilterChipsBar({ basePath }: { basePath: string }) {
  const searchParams = useSearchParams();

  const chips: { key: string; label: string; value: string }[] = [];

  const q = searchParams.get("q");
  if (q) chips.push({ key: "q", label: `Search: "${q}"`, value: q });

  const status = searchParams.get("status");
  if (status) chips.push({ key: "status", label: `Status: ${status}`, value: status });

  const audit = searchParams.get("audit");
  if (audit) chips.push({ key: "audit", label: `Audit: ${audit}`, value: audit });

  const genre = searchParams.get("genre");
  if (genre) chips.push({ key: "genre", label: `Genre: ${genre}`, value: genre });

  const sort = searchParams.get("sort");
  const order = searchParams.get("order") ?? "desc";
  if (sort && sort !== "createdAt") {
    chips.push({ key: "sort", label: `Sort: ${sort} (${order})`, value: sort });
  }

  if (chips.length === 0) return null;

  const removeParam = (paramKey: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(paramKey);
    if (paramKey === "sort") next.delete("order");
    next.delete("page");
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <span className="text-xs text-ink-muted">Active filters:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-bg-elevated px-2.5 py-0.5 text-xs text-ink-primary"
        >
          {chip.label}
          <Link
            href={removeParam(chip.key)}
            className="text-ink-muted hover:text-ink-primary p-0.5 rounded-full"
            aria-label={`Remove filter ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </Link>
        </span>
      ))}
      <Link
        href={basePath}
        className="text-xs text-ink-muted hover:text-ink-brand underline ml-1"
      >
        Clear all
      </Link>
    </div>
  );
}

