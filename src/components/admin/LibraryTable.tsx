import Link from "next/link";
import { Pencil, Eye, EyeOff, Trash2 } from "lucide-react";
import Badge from "@/components/Badge";
import BulkTrashButton from "@/components/admin/BulkTrashButton";
import SelectAllCheckbox from "@/components/admin/SelectAllCheckbox";
import {
  setSelectedStatus,
  setTitleStatus,
  trashSelected,
  trashTitle,
} from "@/lib/admin-catalog-actions";
import type { LibraryRow } from "@/lib/catalog";

/**
 * The list on the library pages (Movies, Series), in the order given
 * (newest first). The whole table is one form: the buttons above it act
 * on the checked rows, and each row's buttons on that row.
 */
export default function LibraryTable({
  items,
  basePath,
  showEpisodes = false,
}: {
  items: LibraryRow[];
  /** /admin/library/movies or /series: edit pages live under it. */
  basePath: string;
  /** Series only — adds the Episodes column before Year. */
  showEpisodes?: boolean;
}) {
  return (
    <form>
      <div className="mx-6 mb-3 flex flex-wrap items-center gap-2 sm:mx-10">
        <span className="text-sm text-ink-muted">With the checked rows:</span>
        <BulkButton formAction={setSelectedStatus.bind(null, "published")}>Publish</BulkButton>
        <BulkButton formAction={setSelectedStatus.bind(null, "draft")}>Unpublish</BulkButton>
        <BulkTrashButton formAction={trashSelected}>Move to trash</BulkTrashButton>
      </div>

      {/* On a narrow screen the table scrolls sideways on its own, as the
          episodes list does, rather than squeezing Title out. */}
      <div className="mx-6 overflow-x-auto rounded-card border border-border-subtle sm:mx-10">
        {/* table-fixed makes the browser actually respect the widths below
            instead of treating them as hints — Title (no width set) then
            gets 100% of whatever space is left over. */}
        <table className={`w-full table-fixed text-sm ${showEpisodes ? "min-w-[760px]" : "min-w-[560px]"}`}>
          <thead>
            <tr className="border-b border-border-subtle bg-bg-surface text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th className="w-10 px-4 py-3 text-left">
                <SelectAllCheckbox />
              </th>
              <th className="px-4 py-3 text-left">Title</th>
              {showEpisodes && <th className="w-48 px-4 py-3 text-left">Seasons/Episodes</th>}
              <th className="w-20 px-4 py-3 text-left">Year</th>
              <th className="w-28 px-4 py-3 text-left">Status</th>
              <th className="w-28 px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-bg-surface">
            {items.map((item) => {
              const isPublished = item.status === "published";
              return (
                <tr key={item.id} className="transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={item.id}
                      aria-label={`Select ${item.title}`}
                      className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`${basePath}/${item.id}`}
                      className="block truncate font-medium text-ink-primary transition-colors hover:text-ink-brand"
                    >
                      {item.title}
                    </Link>
                  </td>
                  {showEpisodes && (
                    <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`${basePath}/${item.id}`}
                        title="Edit"
                        aria-label={`Edit ${item.title}`}
                        className={ICON_BUTTON}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        type="submit"
                        formAction={setTitleStatus.bind(null, item.id, isPublished ? "draft" : "published")}
                        title={isPublished ? "Unpublish" : "Publish"}
                        aria-label={`${isPublished ? "Unpublish" : "Publish"} ${item.title}`}
                        className={ICON_BUTTON}
                      >
                        {isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="submit"
                        formAction={trashTitle.bind(null, item.id)}
                        title="Move to trash"
                        aria-label={`Move ${item.title} to trash`}
                        className={`${ICON_BUTTON_BASE} text-status-error hover:bg-status-error/10`}
                      >
                        <Trash2 className="h-4 w-4" />
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
  );
}

const ICON_BUTTON_BASE = "flex h-8 w-8 items-center justify-center rounded-md transition-colors";
const ICON_BUTTON = `${ICON_BUTTON_BASE} text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary`;

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
