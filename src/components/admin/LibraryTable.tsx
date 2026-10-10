import { Pencil, Eye, EyeOff, Trash2 } from "lucide-react";
import type { LibraryRow } from "@/lib/catalog";
import Badge from "@/components/Badge";

/**
 * Reusable list table for library pages (Movies, Series — same
 * component), in the order given (newest first). The rows are real; the
 * checkboxes and the edit/publish/trash buttons aren't wired to anything
 * yet.
 */
export default function LibraryTable({
  items,
  showEpisodes = false,
}: {
  items: LibraryRow[];
  /** Series only — adds the Episodes column before Year. */
  showEpisodes?: boolean;
}) {
  return (
    <div className="mx-6 overflow-hidden rounded-card border border-border-subtle sm:mx-10">
      {/* table-fixed makes the browser actually respect the widths below
          instead of treating them as hints — Title (no width set) then
          gets 100% of whatever space is left over. */}
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-surface text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <th className="w-10 px-4 py-3 text-left">
              <input
                type="checkbox"
                aria-label="Select all"
                className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
              />
            </th>
            <th className="px-4 py-3 text-left">Title</th>
            {showEpisodes && (
              <th className="w-48 px-4 py-3 text-left">Seasons/Episodes</th>
            )}
            <th className="w-20 px-4 py-3 text-left">Year</th>
            <th className="w-28 px-4 py-3 text-left">Status</th>
            <th className="w-28 px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-bg-surface">
          {items.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-bg-elevated">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
                />
              </td>
              <td className="px-4 py-3">
                {/* Clickable — will route to the edit page later */}
                <button
                  type="button"
                  className="block w-full truncate text-left font-medium text-ink-primary transition-colors hover:text-ink-brand"
                >
                  {item.title}
                </button>
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
                <StatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <IconButton label="Edit">
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={item.status === "published" ? "Unpublish" : "Publish"}
                  >
                    {item.status === "published" ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </IconButton>
                  <IconButton label="Trash" tone="danger">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: LibraryRow["status"] }) {
  const isPublished = status === "published";
  return (
    <Badge tone={isPublished ? "success" : "neutral"}>
      {isPublished ? "Published" : "Draft"}
    </Badge>
  );
}

function IconButton({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        tone === "danger"
          ? "text-status-error hover:bg-status-error/10"
          : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
      }`}
    >
      {children}
    </button>
  );
}
