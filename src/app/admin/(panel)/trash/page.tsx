import type { Metadata } from "next";
import Link from "next/link";
import { Search, RotateCcw, Trash2 } from "lucide-react";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import SelectAllCheckbox from "@/components/admin/SelectAllCheckbox";
import Pagination from "@/components/Pagination";
import {
  deleteTitle,
  restoreTitle,
  bulkRestoreTrash,
  bulkDeleteForGoodTrash,
} from "@/lib/admin-catalog-actions";
import { listTrash } from "@/lib/catalog";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";
import { libraryPath } from "@/lib/title-form";

export const metadata: Metadata = {
  title: "Trash",
};

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function episodeCount(count: number) {
  return count === 1 ? "1 episode" : `${count} episodes`;
}

function daysUntilPurge(trashedAt: Date): number {
  const elapsedDays = Math.floor((Date.now() - trashedAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

/**
 * /admin/trash: titles moved to the trash, with search, bulk restore,
 * bulk permanent delete, and auto-purge countdown.
 */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = firstParam(params.q) ?? "";
  const { items, page, totalPages } = await listTrash({
    page: pageParam(params.page),
    query,
  });

  const makeHref = (p: number) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (p !== 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/trash?${s}` : "/admin/trash";
  };

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Trash</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Titles in the trash are off the site. Auto-deleted after 30 days. Restore titles to bring
            them back to their prior status, or delete permanently.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <form method="get" className="mt-6 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search trash by title..."
            className="w-full rounded-md border border-border-subtle bg-bg-surface pl-9 pr-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-pink focus:outline-hidden"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-border-strong bg-bg-surface px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
        >
          Search
        </button>
        {query && (
          <Link
            href="/admin/trash"
            className="text-xs text-ink-muted hover:text-ink-brand underline ml-1"
          >
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-ink-secondary">
          {query ? "Nothing matches that search in trash." : "The trash is empty."}
        </p>
      ) : (
        <form action={bulkRestoreTrash} className="mt-6">
          {/* Bulk Actions Header */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted cursor-pointer">
                <SelectAllCheckbox />
                <span>Select all</span>
              </label>
              <span className="text-xs font-semibold text-ink-muted">
                With checked (<span data-selected-count className="text-ink-primary font-bold">0</span>):
              </span>
              <button
                type="submit"
                formAction={bulkRestoreTrash}
                className="flex items-center gap-1.5 rounded-card border border-border-strong px-3 py-1 text-xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
              >
                <RotateCcw className="h-3 w-3" />
                Restore checked
              </button>
              <ConfirmSubmitButton
                formAction={bulkDeleteForGoodTrash}
                confirmTitle="Permanently delete checked titles?"
                confirmDescription="All selected titles and their episodes will be permanently deleted. This cannot be undone."
                confirmLabel="Delete permanently"
                className="flex items-center gap-1.5 rounded-card border border-status-error/30 px-3 py-1 text-xs font-semibold text-status-error hover:bg-status-error/10"
              >
                <Trash2 className="h-3 w-3" />
                Delete for good
              </ConfirmSubmitButton>
            </div>
          </div>

          <ul role="list" className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface shadow-2xs">
            {items.map((item) => {
              const isSeries = item.type === "series";
              const daysLeft = daysUntilPurge(item.trashedAt!);

              return (
                <li
                  key={item.id}
                  role="listitem"
                  className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-bg-elevated transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      name="ids"
                      value={item.id}
                      aria-label={`Select ${item.title}`}
                      className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`${libraryPath(item.type)}/${item.id}`}
                          className="font-medium text-ink-primary hover:text-ink-brand truncate"
                        >
                          {item.title}
                        </Link>
                        <span className="inline-flex items-center rounded-full bg-status-warning/15 px-2 py-0.5 text-2xs font-semibold text-status-warning border border-status-warning/30">
                          Purges in ~{daysLeft} {daysLeft === 1 ? "day" : "days"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {isSeries ? `Series · ${episodeCount(item._count.episodes)}` : "Movie"} ·{" "}
                        {item.year} · Moved to the trash {dateTime.format(item.trashedAt!)} UTC
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="submit"
                      formAction={restoreTitle.bind(null, item.id)}
                      aria-label={`Restore ${item.title}`}
                      className="rounded-card border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
                    >
                      Restore
                    </button>
                    <ConfirmSubmitButton
                      formAction={deleteTitle.bind(null, item.id)}
                      ariaLabel={`Delete ${item.title} for good`}
                      confirmTitle="Delete for good?"
                      confirmDescription={
                        isSeries && item._count.episodes > 0
                          ? `"${item.title}" and its ${episodeCount(item._count.episodes)} will be permanently deleted. This cannot be undone.`
                          : `"${item.title}" will be permanently deleted. This cannot be undone.`
                      }
                      confirmLabel="Delete for good"
                      className="rounded-card border border-status-error/30 px-3 py-1.5 text-xs font-semibold text-status-error hover:bg-status-error/10"
                    >
                      Delete for good
                    </ConfirmSubmitButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </form>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} makeHref={makeHref} />
      )}
    </div>
  );
}
