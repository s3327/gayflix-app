import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import { getCollection } from "@/lib/catalog";
import { listingMetadata, shortDescription } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) return { title: "Collection" };
  return listingMetadata(
    collection.title,
    `/collections/${collection.id}`,
    shortDescription(collection.description || `A Gayflix collection: ${collection.title}.`)
  );
}

/**
 * /collections/[id]: one collection's published titles, in its order.
 * A draft, one outside its dates, or one with no published titles is a 404.
 */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) notFound();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <Link
        href="/collections"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Collections
      </Link>
      <h1 className="font-display text-3xl font-bold">{collection.title}</h1>
      {collection.description && (
        <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-ink-secondary">
          {collection.description}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        {collection.media.length} {collection.media.length === 1 ? "title" : "titles"}
      </p>

      <div className="mt-8">
        <MediaGrid>
          {collection.media.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </MediaGrid>
      </div>
    </main>
  );
}
