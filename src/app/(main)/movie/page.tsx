import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { listTitles } from "@/lib/catalog";
import { pageParam, type SearchParams } from "@/lib/search-params";

/**
 * All published movies — fixed filter (type === "movie"), no chips,
 * since there's nothing here for a person to toggle (unlike Genre/
 * Country/Year/Language, which filter by a value the person picks).
 * Structurally this is closer to New Releases (fixed filter + sort +
 * paginate, no chip UI) than to CatalogFilterPage.
 *
 * Sorted by updatedAt, not createdAt — "recently edited," not
 * "recently added." An old title that just got fixed/re-uploaded shows
 * up on page 1; an old, untouched title doesn't, even though both were
 * added to the catalog long ago.
 *
 * Published titles only, like every public listing (src/lib/catalog.ts).
 */
export default async function MoviePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const { items: pageItems, page, totalPages } = await listTitles({
    type: "movie",
    sort: "updated",
    page: pageParam(searchParams.page),
  });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">Movies</h1>

      {pageItems.length > 0 ? (
        <div className="mt-8">
          <MediaGrid>
            {pageItems.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </MediaGrid>
        </div>
      ) : (
        <p className="mt-8 text-sm text-ink-muted">No published movies yet.</p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => (p === 1 ? "/movie" : `/movie?page=${p}`)}
      />
    </main>
  );
}
