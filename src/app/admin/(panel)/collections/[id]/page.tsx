import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ExternalLink, Plus, X } from "lucide-react";
import CollectionForm from "@/components/admin/CollectionForm";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/components/admin/FormFields";
import {
  addToCollection,
  deleteCollection,
  moveInCollection,
  removeFromCollection,
  updateCollection,
} from "@/lib/admin-collection-actions";
import { getCollectionForEdit, searchTitlesForCollection } from "@/lib/catalog";
import { dayValue, isShowing } from "@/lib/collection-form";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Edit Collection",
};

const ICON_BUTTON =
  "rounded-md border border-border-subtle p-1.5 text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary disabled:opacity-30";

function typeLabel(type: string) {
  return type === "series" ? "Series" : "Movie";
}

/**
 * /admin/collections/[id]: a collection's fields, its titles in order
 * (with what keeps any of them off the site), and a search to add more.
 */
export default async function EditCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = firstParam((await searchParams).q) ?? "";
  const [collection, results] = await Promise.all([
    getCollectionForEdit(id),
    searchTitlesForCollection(query),
  ]);
  if (!collection) notFound();
  const inCollection = new Set(collection.items.map((item) => item.mediaId));

  return (
    <div className="px-6 py-10 sm:px-10">
      <Link
        href="/admin/collections"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-secondary hover:text-ink-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Collections
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{collection.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">/collections/{collection.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isShowing(collection) && (
            <Link
              href={`/collections/${collection.id}`}
              className={`${BUTTON_SECONDARY} inline-flex items-center gap-1.5`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              View on Site
            </Link>
          )}
          <form action={deleteCollection.bind(null, collection.id)}>
            <ConfirmSubmitButton
              confirmTitle="Delete Collection"
              confirmDescription={`Delete "${collection.title}"? Its titles stay in the library.`}
              confirmLabel="Delete"
              className={BUTTON_DANGER}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <div className="mt-8">
        <CollectionForm
          action={updateCollection.bind(null, collection.id)}
          submitLabel="Save"
          initialValues={{
            id: collection.id,
            title: collection.title,
            description: collection.description,
            startsAt: dayValue(collection.startsAt),
            endsAt: dayValue(collection.endsAt),
            published: collection.published,
            onHome: collection.onHome,
          }}
        />
      </div>

      <section aria-labelledby="titles-heading" className="mt-12 max-w-3xl">
        <h2 id="titles-heading" className="font-display text-lg font-semibold">
          Titles <span className="text-sm font-normal text-ink-muted">{collection.items.length}</span>
        </h2>
        {collection.items.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">None yet. Search below to add some.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
            {collection.items.map(({ media }, index) => (
              <li key={media.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-right text-xs text-ink-muted">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-primary">{media.title}</p>
                  <p className="text-xs text-ink-muted">
                    {typeLabel(media.type)} · {media.year}
                    {media.trashedAt ? (
                      <span className="text-status-error"> · In the trash, not shown</span>
                    ) : media.status !== "published" ? (
                      <span className="text-status-error"> · Draft, not shown</span>
                    ) : null}
                  </p>
                </div>
                <form action={moveInCollection.bind(null, collection.id, media.id, "up")}>
                  <button type="submit" disabled={index === 0} aria-label={`Move ${media.title} up`} className={ICON_BUTTON}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                </form>
                <form action={moveInCollection.bind(null, collection.id, media.id, "down")}>
                  <button
                    type="submit"
                    disabled={index === collection.items.length - 1}
                    aria-label={`Move ${media.title} down`}
                    className={ICON_BUTTON}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                </form>
                <form action={removeFromCollection.bind(null, collection.id, media.id)}>
                  <button type="submit" aria-label={`Remove ${media.title}`} className={ICON_BUTTON}>
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ol>
        )}

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Add titles</h3>
        <form role="search" className="mt-2 flex gap-2">
          <label htmlFor="collection-search" className="sr-only">
            Search the library
          </label>
          <input
            id="collection-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search the library by title"
            className="w-full max-w-sm rounded-md border border-border-subtle bg-bg-elevated px-4 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-pink focus-visible:outline-hidden"
          />
          <button type="submit" className={BUTTON_SECONDARY}>
            Search
          </button>
        </form>
        {query && results.length === 0 && (
          <p className="mt-3 text-sm text-ink-secondary">No titles match &ldquo;{query}&rdquo;.</p>
        )}
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
            {results.map((media) => (
              <li key={media.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-primary">{media.title}</p>
                  <p className="text-xs text-ink-muted">
                    {typeLabel(media.type)} · {media.year}
                    {media.status !== "published" && " · Draft"}
                  </p>
                </div>
                {inCollection.has(media.id) ? (
                  <span className="text-xs text-ink-muted">In this collection</span>
                ) : (
                  <form action={addToCollection.bind(null, collection.id, media.id)}>
                    <button
                      type="submit"
                      aria-label={`Add ${media.title}`}
                      className={`${BUTTON_SECONDARY} inline-flex items-center gap-1`}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
