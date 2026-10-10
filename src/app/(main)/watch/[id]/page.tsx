import { notFound } from "next/navigation";
import Image from "next/image";
import { Star } from "lucide-react";
import { movieDetails } from "@/lib/mock-movie-details";
import { findBasicTitle } from "@/lib/find-basic-title";
import ServerTabs from "@/components/ServerTabs";
import WatchPlayer from "@/components/WatchPlayer";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";

// Rotated across tags so a multi-tag title doesn't read as one flat block.
const TAG_COLORS = [
  "bg-pride-red-light",
  "bg-pride-yellow",
  "bg-pride-green-light",
  "bg-pride-blue-light",
  "bg-pride-purple-light",
];

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const movie = movieDetails[id];
  const basic = !movie ? findBasicTitle(id) : null;
  if (!movie && !basic) notFound();

  const title = movie?.title ?? basic!.title;
  const year = movie?.year ?? basic!.year;
  const rating = movie?.rating ?? 4.5;
  const duration = movie ? `${movie.runtimeMinutes} min` : basic!.duration;
  const genreList = movie?.genre ?? (basic?.genre ? [basic.genre] : ["Drama"]);
  const gradient = movie?.gradient ?? basic?.gradient ?? "from-brand-pink to-pride-purple";
  const tagline = movie?.tagline;
  const synopsis =
    movie?.synopsis ||
    basic?.synopsis ||
    "Full synopsis for this title will appear once imported.";
  const tags = movie?.tags ?? [genreList[0] ?? "Drama", "LGBTQ+"];
  const director = movie?.director ?? "Director TBA";
  const cast = movie?.cast ?? ["Cast TBA"];
  const country = movie?.country ?? basic?.country ?? "United States";
  const language = movie?.language ?? basic?.language ?? "English";
  const releaseDate = movie?.releaseDate ?? String(year);
  const posterUrl = basic?.posterUrl;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      {/* Player — records watch history on play click */}
      <WatchPlayer
        media={{
          id,
          title,
          year,
          duration,
          type: basic?.type ?? "movie",
          genre: genreList[0] ?? "Uncategorized",
          gradient,
          posterUrl,
        }}
      />

      {/* Server tabs — which sources exist per title will be configured
          on the (future) admin edit page */}
      <div className="mt-4">
        <ServerTabs />
      </div>

      {/* Mini poster + title/rating/tagline/tags */}
      <div className="mt-8 flex gap-4 sm:gap-6">
        <div
          className={`relative aspect-2/3 w-24 shrink-0 overflow-hidden rounded-card bg-bg-surface bg-linear-to-br sm:w-32 ${gradient}`}
        >
          {posterUrl && (
            <Image
              src={posterUrl}
              alt={title}
              fill
              sizes="128px"
              className="object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-baseline gap-2 font-display text-xl font-bold sm:text-2xl">
            {title}
            <span className="text-base font-normal text-ink-secondary">
              ({year})
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-pride-yellow">
              <Star className="h-4 w-4 fill-current" />
              {rating.toFixed(1)}
            </span>
          </h1>

          {tagline && (
            <p className="mt-1 text-sm italic text-ink-muted">
              {tagline}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <button
                key={tag}
                type="button"
                className={`rounded-pill px-3 py-1 text-xs font-semibold text-bg-base transition hover:brightness-110 ${TAG_COLORS[i % TAG_COLORS.length]}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <hr className="my-8 border-border-subtle" />

      {/* Full synopsis */}
      <p className="max-w-3xl text-sm leading-relaxed text-ink-secondary">
        {synopsis}
      </p>

      <dl className="mt-8 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
        <dt className="text-ink-muted">Genre</dt>
        <dd className="text-ink-primary">
          <MetaLinkList items={genreList} />
        </dd>

        <dt className="text-ink-muted">Director</dt>
        <dd className="text-ink-primary">
          <MetaLink>{director}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Cast</dt>
        <dd className="text-ink-primary">
          <MetaLinkList items={cast} />
        </dd>

        <dt className="text-ink-muted">Country</dt>
        <dd className="text-ink-primary">
          <MetaLink>{country}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Language</dt>
        <dd className="text-ink-primary">
          <MetaLink>{language}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Release Date</dt>
        <dd className="text-ink-primary">{releaseDate}</dd>

        <dt className="text-ink-muted">Runtime</dt>
        <dd className="text-ink-primary">{duration}</dd>
      </dl>
    </main>
  );
}
