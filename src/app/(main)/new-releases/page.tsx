import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import Badge from "@/components/Badge";
import { listTitles } from "@/lib/catalog";
import { isRecentlyAdded } from "@/lib/is-new";
import { pageParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "New Releases" };

export default async function NewReleasesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  // Every published title, newest first.
  const requestedPage = pageParam(searchParams.page);
  const { items: pageItems, page, totalPages } = await listTitles({
    sort: "added",
    page: requestedPage,
  });
  // An address past the last page isn't a page.
  if (page !== requestedPage) notFound();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">New Releases</h1>

      {pageItems.length > 0 ? (
        <div className="mt-8">
          <MediaGrid>
            {pageItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                badge={
                  isRecentlyAdded(item.publishedAt ?? item.createdAt) ? (
                    <Badge tone="brand" size="sm">NEW</Badge>
                  ) : undefined
                }
              />
            ))}
          </MediaGrid>
        </div>
      ) : (
        <p className="mt-8 text-sm text-ink-muted">No titles yet.</p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => (p === 1 ? "/new-releases" : `/new-releases?page=${p}`)}
      />
    </main>
  );
}
