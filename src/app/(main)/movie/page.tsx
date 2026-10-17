import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { listTitles } from "@/lib/catalog";
import { listingMetadata } from "@/lib/page-metadata";
import { pageParam, type SearchParams } from "@/lib/search-params";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  return listingMetadata(
    "Movies",
    "/movie",
    "LGBTQ+ films on Gayflix, newest on the site first.",
    pageParam((await searchParams).page)
  );
}

/**
 * All published movies — fixed filter (type === "movie"), nothing to
 * pick (Browse is where filters are). Structurally the same as New
 * Releases: fixed filter + sort + paginate.
 *
 * Newest on the site first (when each was published); editing a title
 * doesn't move it.
 *
 * Published titles only, like every public listing (src/lib/catalog.ts).
 */
export default async function MoviePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const requestedPage = pageParam(searchParams.page);
  const { items: pageItems, page, totalPages } = await listTitles({
    type: "movie",
    sort: "added",
    page: requestedPage,
  });
  // An address past the last page isn't a page.
  if (page !== requestedPage) notFound();

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
