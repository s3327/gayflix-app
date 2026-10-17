import Link from "next/link";
import { Plus } from "lucide-react";
import LibrarySearchBar from "@/components/admin/LibrarySearchBar";
import LibraryTable from "@/components/admin/LibraryTable";
import AuditFilterPills from "@/components/admin/AuditFilterPills";
import FilterChipsBar from "@/components/admin/FilterChipsBar";
import Pagination from "@/components/Pagination";
import {
  LIBRARY_PAGE_SIZE,
  listLibrary,
  type LibrarySort,
  type LibraryOrder,
  type LibraryAudit,
} from "@/lib/catalog";
import type { MediaStatus, MediaType } from "@/lib/media";
import { normalizeQuery } from "@/lib/search";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { libraryPath } from "@/lib/title-form";

function statusParam(value: string | undefined): MediaStatus | undefined {
  return value === "draft" || value === "published" ? value : undefined;
}

/**
 * /admin/library/movies and /admin/library/series: every title of that
 * type, drafts included, newest first, with search by title, audit filters,
 * sort, and status filter. Admins only (listLibrary checks too).
 */
export default async function LibraryPage({
  type,
  searchParams,
}: {
  type: MediaType;
  searchParams: SearchParams;
}) {
  const query = normalizeQuery(firstParam(searchParams.q) ?? "");
  const status = statusParam(firstParam(searchParams.status));
  // listLibrary checks these and replaces unknown ones; the links below use what it used.
  const requestedSort = firstParam(searchParams.sort) as LibrarySort | undefined;
  const requestedOrder = firstParam(searchParams.order) as LibraryOrder | undefined;
  const requestedAudit = firstParam(searchParams.audit) as LibraryAudit | undefined;
  const genre = firstParam(searchParams.genre);
  const requestedPageSize = Number(firstParam(searchParams.pageSize) ?? LIBRARY_PAGE_SIZE);

  const { items, page, totalPages, total, sort, order, audit, pageSize } = await listLibrary({
    type,
    page: pageParam(searchParams.page),
    query,
    status,
    sort: requestedSort,
    order: requestedOrder,
    pageSize: requestedPageSize,
    audit: requestedAudit,
    genre,
  });

  const basePath = libraryPath(type);
  function pageHref(target: number) {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (status) qs.set("status", status);
    if (sort && sort !== "createdAt") qs.set("sort", sort);
    if (order && order !== "desc") qs.set("order", order);
    if (audit) qs.set("audit", audit);
    if (genre) qs.set("genre", genre);
    if (pageSize !== LIBRARY_PAGE_SIZE) qs.set("pageSize", String(pageSize));
    if (target !== 1) qs.set("page", String(target));
    const search = qs.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  const plural = type === "movie" ? "movies" : "series";
  const count = total === 1 && type === "movie" ? "1 movie" : `${total} ${plural}`;
  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">
          Library — {type === "movie" ? "Movies" : "Series"}
        </h1>
        <Link
          href={`/admin/upload/${plural}`}
          className="flex items-center gap-2 rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
        >
          <Plus className="h-4 w-4" />
          {type === "movie" ? "Add a movie" : "Add a series"}
        </Link>
      </div>

      <LibrarySearchBar action={basePath} query={query} status={status ?? "all"} />

      <div className="mx-6 mt-3 space-y-2 sm:mx-10">
        <AuditFilterPills basePath={basePath} type={type} />
        <FilterChipsBar basePath={basePath} />
      </div>

      {items.length > 0 ? (
        <div className="mt-4">
          <p className="mx-6 mb-3 text-sm text-ink-muted sm:mx-10">{count}</p>
          <LibraryTable
            items={items}
            basePath={basePath}
            showEpisodes={type === "series"}
            exportType={type === "movie" ? "movies" : "series"}
          />
        </div>
      ) : (
        <p className="mx-6 mt-6 text-sm text-ink-secondary sm:mx-10">
          {query || status || audit ? "Nothing matches that filter or search." : `No ${plural} yet.`}
        </p>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} makeHref={pageHref} />
      )}
    </div>
  );
}
