"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Pencil,
  Eye,
  EyeOff,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Tag,
  Download,
  Film,
} from "lucide-react";
import Badge from "@/components/Badge";
import BulkTrashButton from "@/components/admin/BulkTrashButton";
import SelectAllCheckbox from "@/components/admin/SelectAllCheckbox";
import QuickEditDrawer from "@/components/admin/QuickEditDrawer";
import BulkTagModal from "@/components/admin/BulkTagModal";
import {
  setSelectedStatus,
  setTitleStatus,
  trashSelected,
  trashTitle,
} from "@/lib/admin-catalog-actions";
import type { LibraryRow } from "@/lib/catalog";

export default function LibraryTable({
  items: initialItems,
  basePath,
  showEpisodes = false,
  exportType = "movies",
}: {
  items: LibraryRow[];
  basePath: string;
  showEpisodes?: boolean;
  exportType?: "movies" | "series";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [overrides, setOverrides] = useState<Record<string, Partial<LibraryRow>>>({});
  const items = initialItems.map((item) => {
    const override = overrides[item.id];
    return override ? { ...item, ...override } : item;
  });
  const [activeQuickEditItem, setActiveQuickEditItem] = useState<LibraryRow | null>(null);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const formRef = useRef<HTMLFormElement>(null);

  const currentSort = searchParams.get("sort") ?? "createdAt";
  const currentOrder = searchParams.get("order") ?? "desc";

  const makeSortHref = (col: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (currentSort === col) {
      next.set("order", currentOrder === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", col);
      next.set("order", "asc");
    }
    next.delete("page");
    return `${basePath}?${next.toString()}`;
  };

  const getSelectedIds = (): string[] => {
    if (!formRef.current) return [];
    const checked = formRef.current.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked');
    return Array.from(checked).map((cb) => cb.value);
  };

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (activeQuickEditItem || bulkTagIds.length > 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(items.length - 1, prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(0, prev - 1));
    } else if ((e.key === " " || e.key.toLowerCase() === "x") && focusedIndex >= 0) {
      e.preventDefault();
      const currentItem = items[focusedIndex];
      if (currentItem && formRef.current) {
        const checkbox = formRef.current.querySelector<HTMLInputElement>(
          `input[name="ids"][value="${currentItem.id}"]`
        );
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    } else if (e.key.toLowerCase() === "q" && focusedIndex >= 0) {
      e.preventDefault();
      if (items[focusedIndex]) {
        setActiveQuickEditItem(items[focusedIndex]);
      }
    } else if (e.key.toLowerCase() === "e" && focusedIndex >= 0) {
      e.preventDefault();
      if (items[focusedIndex]) {
        router.push(`${basePath}/${items[focusedIndex].id}`);
      }
    }
  };

  return (
    <>
      <form ref={formRef} onKeyDown={handleTableKeyDown}>
        {/* Bulk Action & Export Toolbar */}
        <div className="mx-6 mb-3 flex flex-wrap items-center justify-between gap-3 sm:mx-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted">
              With checked (<span data-selected-count className="text-ink-primary font-bold">0</span>):
            </span>
            <BulkButton formAction={setSelectedStatus.bind(null, "published")}>Publish</BulkButton>
            <BulkButton formAction={setSelectedStatus.bind(null, "draft")}>Unpublish</BulkButton>
            <button
              type="button"
              onClick={() => {
                const ids = getSelectedIds();
                if (ids.length > 0) setBulkTagIds(ids);
              }}
              className="flex items-center gap-1 rounded-card border border-border-strong px-3 py-1 text-xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
            >
              <Tag className="h-3 w-3" /> Tag...
            </button>
            <BulkTrashButton formAction={trashSelected}>Move to trash</BulkTrashButton>
          </div>

          <div>
            <a
              href={`/api/admin/export?type=${exportType}&${searchParams.toString()}`}
              download
              className="flex items-center gap-1.5 rounded-card border border-border-subtle bg-bg-surface px-3 py-1 text-xs font-semibold text-ink-secondary hover:border-border-strong hover:text-ink-primary shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-brand-pink" />
              Export CSV
            </a>
          </div>
        </div>

        {/* Desktop & Tablet Table (md and up) */}
        <div className="mx-6 overflow-x-auto rounded-card border border-border-subtle sm:mx-10">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-surface text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th className="w-10 px-4 py-3 text-left">
                  <SelectAllCheckbox />
                </th>
                <th className="w-14 px-2 py-3 text-center">Poster</th>
                <th className="px-4 py-3 text-left">
                  <Link href={makeSortHref("title")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                    Title
                    <SortIcon col="title" currentSort={currentSort} currentOrder={currentOrder} />
                  </Link>
                </th>
                {showEpisodes && <th className="w-48 px-4 py-3 text-left">Seasons/Episodes</th>}
                <th className="w-24 px-4 py-3 text-left">
                  <Link href={makeSortHref("year")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                    Year
                    <SortIcon col="year" currentSort={currentSort} currentOrder={currentOrder} />
                  </Link>
                </th>
                <th className="w-28 px-4 py-3 text-left">
                  <Link href={makeSortHref("status")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                    Status
                    <SortIcon col="status" currentSort={currentSort} currentOrder={currentOrder} />
                  </Link>
                </th>
                <th className="w-24 px-4 py-3 text-left">
                  <Link href={makeSortHref("viewCount")} className="inline-flex items-center gap-1 hover:text-ink-primary">
                    Views
                    <SortIcon col="viewCount" currentSort={currentSort} currentOrder={currentOrder} />
                  </Link>
                </th>
                <th className="w-56 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-bg-surface">
              {items.map((item, idx) => {
                const isPublished = item.status === "published";
                const isRowFocused = focusedIndex === idx;

                return (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    onFocus={() => setFocusedIndex(idx)}
                    className={`transition-colors hover:bg-bg-elevated ${
                      isRowFocused ? "bg-bg-elevated ring-1 ring-brand-pink/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        name="ids"
                        value={item.id}
                        aria-label={`Select ${item.title}`}
                        className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      {item.posterUrl ? (
                        <div className="relative mx-auto h-12 w-8 overflow-hidden rounded bg-bg-base border border-border-subtle">
                          <Image
                            src={item.posterUrl}
                            alt=""
                            fill
                            sizes="32px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="mx-auto flex h-12 w-8 items-center justify-center rounded bg-bg-base text-ink-muted border border-border-subtle">
                          <Film className="h-4 w-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`${basePath}/${item.id}`}
                          className="block truncate font-medium text-ink-primary transition-colors hover:text-ink-brand"
                        >
                          {item.title}
                        </Link>
                        {item.tagline && (
                          <span className="block truncate text-2xs text-ink-muted">
                            {item.tagline}
                          </span>
                        )}
                      </div>
                    </td>
                    {showEpisodes && (
                      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary text-xs">
                        {item.episodes != null && item.seasons != null
                          ? `${item.seasons} Season${item.seasons === 1 ? "" : "s"} · ${item.episodes} Episode${item.episodes === 1 ? "" : "s"}`
                          : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-ink-secondary">{item.year}</td>
                    <td className="px-4 py-3">
                      <Badge tone={isPublished ? "success" : "neutral"}>
                        {isPublished ? "Published" : "Draft"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-muted font-mono text-xs">
                      {item.viewCount?.toLocaleString() ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveQuickEditItem(item)}
                          title="Quick edit (Q)"
                          aria-label={`Quick edit ${item.title}`}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary border border-border-subtle"
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          <span>Quick</span>
                        </button>
                        <Link
                          href={`${basePath}/${item.id}`}
                          title="Full edit (E)"
                          aria-label={`Edit ${item.title}`}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary border border-border-subtle"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit</span>
                        </Link>
                        <button
                          type="submit"
                          formAction={setTitleStatus.bind(null, item.id, isPublished ? "draft" : "published")}
                          title={isPublished ? "Unpublish" : "Publish"}
                          aria-label={`${isPublished ? "Unpublish" : "Publish"} ${item.title}`}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary border border-border-subtle"
                        >
                          {isPublished ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3 text-status-success" />}
                          <span>{isPublished ? "Unpublish" : "Publish"}</span>
                        </button>
                        <button
                          type="submit"
                          formAction={trashTitle.bind(null, item.id)}
                          title="Move to trash"
                          aria-label={`Move ${item.title} to trash`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-status-error hover:bg-status-error/10 border border-status-error/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </form>

      {/* Slide-over Quick Edit Drawer */}
      {activeQuickEditItem && (
        <QuickEditDrawer
          item={activeQuickEditItem}
          onClose={() => setActiveQuickEditItem(null)}
          onSaved={(updated) => {
            setOverrides((prev) => ({
              ...prev,
              [activeQuickEditItem.id]: {
                ...prev[activeQuickEditItem.id],
                ...updated,
              },
            }));
          }}
        />
      )}

      {/* Bulk Tagging Modal */}
      {bulkTagIds.length > 0 && (
        <BulkTagModal
          selectedIds={bulkTagIds}
          onClose={() => setBulkTagIds([])}
          onCompleted={() => {
            setBulkTagIds([]);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function SortIcon({
  col,
  currentSort,
  currentOrder,
}: {
  col: string;
  currentSort: string;
  currentOrder: string;
}) {
  if (currentSort !== col) {
    return <ArrowUpDown className="h-3 w-3 text-ink-muted/50" />;
  }
  return currentOrder === "asc" ? (
    <ArrowUp className="h-3 w-3 text-brand-pink" />
  ) : (
    <ArrowDown className="h-3 w-3 text-brand-pink" />
  );
}

function BulkButton({
  formAction,
  children,
}: {
  formAction: (form: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className="rounded-card border border-border-strong px-3 py-1 text-xs font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
    >
      {children}
    </button>
  );
}
