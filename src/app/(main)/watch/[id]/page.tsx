import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { getTitle, getVideoSources } from "@/lib/catalog";
import WatchPlayer from "@/components/WatchPlayer";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";
import TagList from "@/components/TagList";
import TitleActions from "@/components/TitleActions";
import type { FavoriteEntry } from "@/lib/favorites-context";
import { countryHref, genreHref, languageHref, searchHref } from "@/lib/browse-href";
import { watchMetadata } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const movie = await getTitle((await params).id);
  // A series redirects to its first episode, which has its own.
  return movie?.type === "movie" ? watchMetadata(movie) : {};
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [movie, sources] = await Promise.all([getTitle(id), getVideoSources({ mediaId: id })]);
  if (!movie) notFound();
  // A series has no single video: play its first episode instead.
  if (movie.type === "series") {
    const [first] = movie.episodes;
    redirect(first ? `/episode/${first.id}` : `/series/${movie.id}`);
  }

  const entry: FavoriteEntry = {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    duration: movie.duration,
    type: "movie",
    genre: movie.genre,
    gradient: movie.gradient,
    posterUrl: movie.posterUrl,
  };

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      {/* Player and its server tabs — records watch history on play click */}
      <WatchPlayer
        media={entry}
        sources={sources}
        backdropUrl={movie.backdropUrl}
      />

      {/* Mini poster + title/rating/tagline/tags; the poster and title lead
          to the title's page. The poster link is for the mouse only: the
          title is the same link for keyboards and screen readers. */}
      <div className="mt-8 flex gap-4 sm:gap-6">
        <Link
          href={`/movie/${movie.id}`}
          tabIndex={-1}
          aria-hidden
          className={`relative aspect-2/3 w-24 shrink-0 overflow-hidden rounded-card bg-bg-surface bg-linear-to-br transition-opacity hover:opacity-80 sm:w-32 ${movie.gradient ?? ""}`}
        >
          <Image
            src={movie.posterUrl}
            alt=""
            fill
            sizes="128px"
            className="object-cover"
          />
        </Link>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-baseline gap-2 font-display text-xl font-bold sm:text-2xl">
            <Link href={`/movie/${movie.id}`} className="transition-colors hover:text-ink-brand">
              {movie.title}
            </Link>
            <span className="text-base font-normal text-ink-secondary">({movie.year})</span>
            {movie.rating !== undefined && (
              <span className="flex items-center gap-1 text-sm font-semibold text-pride-yellow">
                <Star className="h-4 w-4 fill-current" />
                {movie.rating.toFixed(1)}
              </span>
            )}
          </h1>

          {movie.tagline && <p className="mt-1 text-sm italic text-ink-muted">{movie.tagline}</p>}

          <TagList tags={movie.tags} className="mt-3" />

          <TitleActions media={entry} className="mt-4" />
        </div>
      </div>

      <hr className="my-8 border-border-subtle" />

      {movie.synopsis && (
        <p className="max-w-3xl text-sm leading-relaxed text-ink-secondary">{movie.synopsis}</p>
      )}

      <dl className="mt-8 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
        {movie.genres.length > 0 && (
          <>
            <dt className="text-ink-muted">Genre</dt>
            <dd className="text-ink-primary">
              <MetaLinkList items={movie.genres} href={genreHref} />
            </dd>
          </>
        )}

        {movie.director && (
          <>
            <dt className="text-ink-muted">Director</dt>
            <dd className="text-ink-primary">
              <MetaLink href={searchHref(movie.director)}>{movie.director}</MetaLink>
            </dd>
          </>
        )}

        {movie.cast.length > 0 && (
          <>
            <dt className="text-ink-muted">Cast</dt>
            <dd className="text-ink-primary">
              <MetaLinkList items={movie.cast} href={searchHref} />
            </dd>
          </>
        )}

        <dt className="text-ink-muted">Country</dt>
        <dd className="text-ink-primary">
          <MetaLink href={countryHref(movie.country)}>{movie.country}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Language</dt>
        <dd className="text-ink-primary">
          <MetaLink href={languageHref(movie.language)}>{movie.language}</MetaLink>
        </dd>

        {movie.releaseDate && (
          <>
            <dt className="text-ink-muted">Release Date</dt>
            <dd className="text-ink-primary">{movie.releaseDate}</dd>
          </>
        )}

        <dt className="text-ink-muted">Runtime</dt>
        <dd className="text-ink-primary">
          {movie.runtimeMinutes ? `${movie.runtimeMinutes} min` : movie.duration}
        </dd>
      </dl>
    </main>
  );
}
