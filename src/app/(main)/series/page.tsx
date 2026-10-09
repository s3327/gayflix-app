import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import { paginate } from "@/lib/paginate";
import { publishedMediaItems } from "@/lib/mock-media";

/**
 * All published series — same shape as /movie, just type === "series"
 * instead of "movie". See that page's header comment for why this is a
 * fixed-filter page (no chips) sorted by updatedAt rather than
 * createdAt, and for why it reads from publishedMediaItems.
 */
export default function SeriesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const publishedSeries = publishedMediaItems.filter((item) => item.type === "series");

  const sorted = [...publishedSeries].sort(
    (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
  );

  const requestedPage = Number(searchParams.page) || 1;
  const { page, totalPages, pageItems } = paginate(sorted, requestedPage);

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
