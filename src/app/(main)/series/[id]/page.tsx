import { notFound } from "next/navigation";
import Link from "next/link";
import { Star, Play } from "lucide-react";
import { seriesDetails } from "@/lib/mock-series-details";
import { newReleases } from "@/lib/mock-titles";
import { findBasicTitle } from "@/lib/find-basic-title";
import ReadMoreText from "@/components/ReadMoreText";
import FavoriteButton from "@/components/FavoriteButton";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";
import RecommendationSection from "@/components/RecommendationSection";
import BasicTitleFallback from "@/components/BasicTitleFallback";
import SeasonTabs from "@/components/SeasonTabs";

// Same rotation as /movie/[id] — kept in sync intentionally, not
// re-derived, since a shared component is a bigger change than this
// page needs right now.
const TAG_COLORS = [
  "bg-pride-red-light",
  "bg-pride-yellow",
  "bg-pride-green-light",
  "bg-pride-blue-light",
  "bg-pride-purple-light",
];

/**
 * Deliberately the same 2-column layout as /movie/[id] (poster + primary
 * actions on the left, details on the right) — series aren't a
 * different product, just a different metadata shape. Two differences
 * from the movie page:
 *   1. The meta list shows Seasons/Episodes instead of a single Runtime
 *      (a series doesn't have one runtime — every episode has its own).
 *   2. The action row is Favorite alone, no Watch Now/Play — see this
 *      page's own note below for why, and what I'd suggest instead of
 *      just leaving it empty forever.
 */
export default function SeriesPage({ params }: { params: { id: string } }) {
  const show = seriesDetails[params.id];

  // Only 2 series have full detail records so far (mirroring
  // mock-movie-details.ts's handful-of-many approach for movies).
  // Everything else falls back to a basic view instead of 404ing, as
  // long as it exists in *some* mock data pool.
  if (!show) {
    const basic = findBasicTitle(params.id);
    if (!basic) notFound();
    return <BasicTitleFallback item={basic} typeLabel="Series" />;
  }

  const seasonCount = new Set(show.episodes.map((ep) => ep.seasonNumber)).size;
  const episodeCount = show.episodes.length;

  // Same placeholder recommendation source as /movie/[id] — see that
  // page's comment for why (real related-titles logic comes later).
  const recommended = newReleases.filter((t) => t.id !== show.id);

  return (
    <main>
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          {/* Poster */}
          <div className="mx-auto w-full max-w-[240px] shrink-0 md:mx-0 md:w-72">
            <div
              className={`relative aspect-[2/3] w-full overflow-hidden rounded-card bg-bg-surface bg-gradient-to-br ${show.gradient}`}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-bg-base/30 via-transparent to-transparent" />
            </div>

            {show.episodes.length > 0 && (
              <div className="mt-4">
                <Link
                  href={`/episode/${show.episodes[0].id}`}
                  className="flex items-center justify-center gap-2 rounded-card bg-brand-pink px-5 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Start Watching
                </Link>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-baseline gap-2 font-display text-xl font-bold sm:text-2xl">
              {show.title}
              <span className="text-base font-normal text-ink-secondary">
                ({show.year})
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-pride-yellow">
                <Star className="h-4 w-4 fill-current" />
                {show.rating.toFixed(1)}
              </span>
            </h1>

            {show.tagline && (
              <p className="mt-1 text-sm italic leading-snug text-ink-muted">
                {show.tagline}
              </p>
            )}

            <div className="mt-3 max-w-2xl">
              <ReadMoreText text={show.synopsis} />
            </div>

            <dl className="mt-4 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm leading-snug sm:grid-cols-[140px_1fr]">
              <dt className="text-ink-muted">Genre</dt>
              <dd className="text-ink-primary">
                <MetaLinkList items={show.genre} />
              </dd>

              <dt className="text-ink-muted">Creator</dt>
              <dd className="text-ink-primary">
                <MetaLink>{show.creator}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Cast</dt>
              <dd className="text-ink-primary">
                <MetaLinkList items={show.cast} />
              </dd>

              <dt className="text-ink-muted">Country</dt>
              <dd className="text-ink-primary">
                <MetaLink>{show.country}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Language</dt>
              <dd className="text-ink-primary">
                <MetaLink>{show.language}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Release Date</dt>
              <dd className="text-ink-primary">{show.releaseDate}</dd>

              <dt className="text-ink-muted">Seasons</dt>
              <dd className="text-ink-primary">{seasonCount}</dd>

              <dt className="text-ink-muted">Episodes</dt>
              <dd className="text-ink-primary">{episodeCount}</dd>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {show.tags.map((tag, i) => (
                <button
                  key={tag}
                  type="button"
                  className={`rounded-pill px-3 py-1 text-xs font-semibold text-bg-base transition hover:brightness-110 ${TAG_COLORS[i % TAG_COLORS.length]}`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Favorite is the only action here — a series itself has
                no single video source, only its episodes do (see
                SeasonTabs below, and /episode/[id]). See this page's
                header comment for the suggestion on a future Play
                button instead of nothing. */}
            <div className="mt-4">
              <FavoriteButton
                showLabel
                media={{
                  id: show.id,
                  title: show.title,
                  year: show.year,
                  duration: `${seasonCount} Season${seasonCount === 1 ? "" : "s"}`,
                  type: "series",
                  genre: show.genre[0] ?? "Uncategorized",
                  gradient: show.gradient,
                }}
              />
            </div>
          </div>
        </div>

        {/* Season-tabbed episode list — its own wrapper below the poster
            + detail block, not squeezed into either column. */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-semibold">Episodes</h2>
          <div className="mt-4">
            <SeasonTabs episodes={show.episodes} />
          </div>
        </div>
      </div>

      <hr className="mx-auto max-w-[1440px] border-border-subtle" />

      <div className="pb-16">
        <RecommendationSection media={recommended} />
      </div>
    </main>
  );
}
