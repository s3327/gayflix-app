import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import { listCollections } from "@/lib/catalog";
import { listingMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = listingMetadata(
  "Collections",
  "/collections",
  "Hand-picked collections of LGBTQ+ films and series: seasonal picks, classics and staff favorites."
);

/** /collections (A11): every collection showing now, in the order the team set. */
export default async function CollectionsPage() {
  const collections = await listCollections();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">Collections</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        Hand-picked by the Gayflix team. Looking for members&apos; picks? See{" "}
        <Link href="/lists" className="font-semibold text-ink-brand hover:underline">
          Community Lists
        </Link>
        .
      </p>

      {collections.length > 0 ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/collections/${collection.id}`}
                className="group block rounded-card border border-border-subtle bg-bg-surface p-4 transition-colors hover:border-brand-pink"
              >
                <div className="grid grid-cols-4 gap-2" aria-hidden>
                  {collection.media.map((media) => (
                    <MediaCoverThumb key={media.id} entry={media} sizes="100px" />
                  ))}
                </div>
                <p className="mt-3 truncate font-display text-base font-semibold text-ink-primary">
                  {collection.title}
                </p>
                {collection.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">{collection.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
          <Sparkles className="h-8 w-8 text-ink-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-ink-secondary">No collections right now. Check back soon.</p>
        </div>
      )}
    </main>
  );
}
