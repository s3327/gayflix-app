import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Home } from "lucide-react";
import CollectionForm from "@/components/admin/CollectionForm";
import { createCollection, moveCollection } from "@/lib/admin-collection-actions";
import { listCollectionsForAdmin } from "@/lib/catalog";
import { dayValue, isShowing } from "@/lib/collection-form";

export const metadata: Metadata = {
  title: "Collections",
};

const ICON_BUTTON =
  "rounded-md border border-border-subtle p-1.5 text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary disabled:opacity-30";

function status(collection: { published: boolean; startsAt: Date | null; endsAt: Date | null }) {
  if (!collection.published) return { label: "Draft", tone: "text-ink-muted" };
  if (isShowing(collection)) return { label: "Showing", tone: "text-status-success" };
  const today = dayValue(new Date());
  return collection.startsAt && dayValue(collection.startsAt) > today
    ? { label: `From ${dayValue(collection.startsAt)}`, tone: "text-ink-secondary" }
    : { label: "Ended", tone: "text-ink-muted" };
}

/**
 * /admin/collections (A11): curated collections such as Pride Month or
 * staff picks, in the order /collections and the home page show them,
 * and a form for a new one.
 */
export default async function CollectionsPage() {
  const collections = await listCollectionsForAdmin();

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Collections</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Hand-picked sets of titles, shown at /collections in this order. Up to three can also be
        home page rows.
      </p>

      {collections.length === 0 ? (
        <p className="mt-8 text-sm text-ink-secondary">No collections yet. Add the first below.</p>
      ) : (
        <ol className="mt-8 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface shadow-2xs">
          {collections.map((collection, index) => {
            const { label, tone } = status(collection);
            return (
              <li key={collection.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/collections/${collection.id}`}
                    className="font-medium text-ink-primary hover:text-ink-brand hover:underline"
                  >
                    {collection.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                    <span className={`font-semibold ${tone}`}>{label}</span>
                    <span>
                      · {collection._count.items} {collection._count.items === 1 ? "title" : "titles"}
                    </span>
                    {collection.onHome && (
                      <span className="inline-flex items-center gap-1">
                        · <Home className="h-3 w-3" aria-hidden /> Home row
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1">
                  <form action={moveCollection.bind(null, collection.id, "up")}>
                    <button
                      type="submit"
                      disabled={index === 0}
                      aria-label={`Move ${collection.title} up`}
                      className={ICON_BUTTON}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                  <form action={moveCollection.bind(null, collection.id, "down")}>
                    <button
                      type="submit"
                      disabled={index === collections.length - 1}
                      aria-label={`Move ${collection.title} down`}
                      className={ICON_BUTTON}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section aria-labelledby="new-heading" className="mt-12">
        <h2 id="new-heading" className="font-display text-lg font-semibold">
          New collection
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Add it, then pick its titles.</p>
        <div className="mt-5">
          <CollectionForm
            action={createCollection}
            isNew
            submitLabel="Add Collection"
            initialValues={{
              id: "",
              title: "",
              description: "",
              startsAt: "",
              endsAt: "",
              published: false,
              onHome: false,
            }}
          />
        </div>
      </section>
    </div>
  );
}
