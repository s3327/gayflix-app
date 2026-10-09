import { notFound } from "next/navigation";
import Link from "next/link";
import { Play, Star } from "lucide-react";
import { movieDetails } from "@/lib/mock-movie-details";
import { newReleases } from "@/lib/mock-titles";
import { findBasicTitle } from "@/lib/find-basic-title";
import ReadMoreText from "@/components/ReadMoreText";
import FavoriteButton from "@/components/FavoriteButton";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";
import RecommendationSection from "@/components/RecommendationSection";
import BasicTitleFallback from "@/components/BasicTitleFallback";

// Rotated across tags so a multi-tag title doesn't read as one flat block.
const TAG_COLORS = [
  "bg-pride-red-light",
  "bg-pride-yellow",
  "bg-pride-green-light",
  "bg-pride-blue-light",
  "bg-pride-purple-light",
];

export default function MoviePage({ params }: { params: { id: string } }) {
  const movie = movieDetails[params.id];

  // Only 4 titles have full detail records. Everything else (e.g. any of
  // Trending's 100 mock items) falls back to a basic view instead of
  // 404ing, as long as it exists in *some* mock data pool.
  if (!movie) {
    const basic = findBasicTitle(params.id);
    if (!basic) notFound();
    return <BasicTitleFallback item={basic} typeLabel="Movie" />;
  }

  // Placeholder recommendation source — real "related titles" logic
  // (genre/director/cast matching) and the admin toggle for related-vs-
  // new-release mode both come later. For now this just filters the
  // current title out of New Releases so it doesn't recommend itself.
  const recommended = newReleases.filter((t) => t.id !== movie.id);

  return (
    <main>
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          {/* Poster + primary actions */}
          <div className="mx-auto w-full max-w-[240px] shrink-0 md:mx-0 md:w-72">
            <div
              className={`relative aspect-[2/3] w-full overflow-hidden rounded-card bg-bg-surface bg-gradient-to-br ${movie.gradient}`}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-bg-base/30 via-transparent to-transparent" />
            </div>

            {/* Watch Now now routes to the real /watch page. Favorite
                moved below the tags list in the details column — see
                that section. */}
            <div className="mt-4">
              <Link
                href={`/watch/${movie.id}`}
                className="flex items-center justify-center gap-2 rounded-card bg-brand-pink px-5 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
              >
                <Play className="h-4 w-4 fill-current" />
                Watch Now
              </Link>
            </div>
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-baseline gap-2 font-display text-xl font-bold sm:text-2xl">
              {movie.title}
              <span className="text-base font-normal text-ink-secondary">
                ({movie.year})
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-pride-yellow">
                <Star className="h-4 w-4 fill-current" />
                {movie.rating.toFixed(1)}
              </span>
            </h1>

            {movie.tagline && (
              <p className="mt-1 text-sm italic leading-snug text-ink-muted">
                {movie.tagline}
              </p>
            )}

            <div className="mt-3 max-w-2xl">
              <ReadMoreText text={movie.synopsis} />
            </div>

            <dl className="mt-4 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm leading-snug sm:grid-cols-[140px_1fr]">
              <dt className="text-ink-muted">Genre</dt>
              <dd className="text-ink-primary">
                <MetaLinkList items={movie.genre} />
              </dd>

              <dt className="text-ink-muted">Director</dt>
              <dd className="text-ink-primary">
                <MetaLink>{movie.director}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Cast</dt>
              <dd className="text-ink-primary">
                <MetaLinkList items={movie.cast} />
              </dd>

              <dt className="text-ink-muted">Country</dt>
              <dd className="text-ink-primary">
                <MetaLink>{movie.country}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Language</dt>
              <dd className="text-ink-primary">
                <MetaLink>{movie.language}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Release Date</dt>
              <dd className="text-ink-primary">{movie.releaseDate}</dd>

              <dt className="text-ink-muted">Runtime</dt>
              <dd className="text-ink-primary">{movie.runtimeMinutes} min</dd>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {movie.tags.map((tag, i) => (
                <button
                  key={tag}
                  type="button"
                  className={`rounded-pill px-3 py-1 text-xs font-semibold text-bg-base transition hover:brightness-110 ${TAG_COLORS[i % TAG_COLORS.length]}`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <FavoriteButton
                showLabel
                media={{
                  id: movie.id,
                  title: movie.title,
                  year: movie.year,
                  duration: `${movie.runtimeMinutes} min`,
                  type: "movie",
                  genre: movie.genre[0] ?? "Uncategorized",
                  gradient: movie.gradient,
                }}
              />
            </div>
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
