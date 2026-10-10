import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import Badge from "@/components/Badge";
import { paginate } from "@/lib/paginate";
import { publishedMediaItems } from "@/lib/mock-media";
import { isRecentlyAdded } from "@/lib/is-new";
import { pageParam, type SearchParams } from "@/lib/search-params";

export default async function NewReleasesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  // Explicit sort rather than relying on the mock data's construction
  // order — this is what "query all media, newest first" actually means
  // once it's a real DB query (`ORDER BY created_at DESC`), so the mock
  // should behave the same way rather than just happening to already be
  // in the right order.
  const sorted = [...publishedMediaItems].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );

  const requestedPage = pageParam(searchParams.page);
  const { page, totalPages, pageItems } = paginate(sorted, requestedPage);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">New Releases</h1>

      <div className="mt-8">
        <MediaGrid>
          {pageItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              badge={
                isRecentlyAdded(item.createdAt) ? (
                  <Badge tone="brand" size="sm">NEW</Badge>
                ) : undefined
              }
            />
          ))}
        </MediaGrid>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => (p === 1 ? "/new-releases" : `/new-releases?page=${p}`)}
      />
    </main>
  );
}
