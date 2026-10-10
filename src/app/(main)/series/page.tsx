import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { listTitles } from "@/lib/catalog";
import { pageParam, type SearchParams } from "@/lib/search-params";

/**
 * All published series — same shape as /movie, just type === "series"
 * instead of "movie". See that page's header comment for why this is a
 * fixed-filter page (no chips) sorted by updatedAt rather than
 * createdAt.
 */
export default async function SeriesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const { items: pageItems, page, totalPages } = await listTitles({
    type: "series",
    sort: "updated",
    page: pageParam(searchParams.page),
  });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">Series</h1>

      {pageItems.length > 0 ? (
        <div className="mt-8">
          <MediaGrid>
            {pageItems.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </MediaGrid>
        </div>
      ) : (
        <p className="mt-8 text-sm text-ink-muted">No published series yet.</p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => (p === 1 ? "/series" : `/series?page=${p}`)}
      />
    </main>
  );
}
