import Link from "next/link";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/components/admin/FormFields";
import Pagination from "@/components/Pagination";
import { deleteTitle, restoreTitle } from "@/lib/admin-catalog-actions";
import { listTrash } from "@/lib/catalog";
import { pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";
import { libraryPath } from "@/lib/title-form";

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function episodeCount(count: number) {
  return count === 1 ? "1 episode" : `${count} episodes`;
}

/**
 * Titles moved to the trash, most recent first. They're off the site;
 * each can be restored (as a draft) or deleted for good with its
 * episodes.
 */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const { items, page, totalPages, total } = await listTrash({ page: pageParam(params.page) });

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Trash</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Titles in the trash are off the site. Restore one to bring it back as a draft, or delete
        it for good.
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-ink-secondary">The trash is empty.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-muted">
            {total === 1 ? "1 title" : `${total} titles`}
          </p>
          <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
            {items.map((item) => {
              const isSeries = item.type === "series";
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`${libraryPath(item.type)}/${item.id}`}
                      className="font-medium text-ink-primary transition-colors hover:text-ink-brand"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {isSeries ? `Series · ${episodeCount(item._count.episodes)}` : "Movie"} ·{" "}
                      {item.year} · Moved to the trash {dateTime.format(item.trashedAt!)} UTC
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={restoreTitle.bind(null, item.id)}>
                      <button
                        type="submit"
                        aria-label={`Restore ${item.title}`}
                        className={BUTTON_SECONDARY}
                      >
                        Restore
                      </button>
                    </form>
                    <form action={deleteTitle.bind(null, item.id)}>
                      <ConfirmSubmitButton
                        ariaLabel={`Delete ${item.title} for good`}
                        confirmTitle="Delete for good?"
                        confirmDescription={
                          isSeries && item._count.episodes > 0
                            ? `"${item.title}" and its ${episodeCount(item._count.episodes)} will be deleted. This can't be undone.`
                            : `"${item.title}" will be deleted. This can't be undone.`
                        }
                        confirmLabel="Delete for good"
                        className={BUTTON_DANGER}
                      >
                        Delete for good
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          makeHref={(target) => (target === 1 ? "/admin/trash" : `/admin/trash?page=${target}`)}
        />
      )}
    </div>
  );
}
