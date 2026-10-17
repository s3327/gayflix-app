import Image from "next/image";
import Link from "next/link";
import { Play, Star } from "lucide-react";
import type { Media, MediaDetail } from "@/lib/media";
import ReadMoreText from "@/components/ReadMoreText";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";
import RecommendationSection from "@/components/RecommendationSection";
import SeasonTabs from "@/components/SeasonTabs";
import SeriesPlayButton from "@/components/SeriesPlayButton";
import TagList from "@/components/TagList";
import TitleActions from "@/components/TitleActions";
import { countryHref, genreHref, languageHref, searchHref } from "@/lib/browse-href";

const PLAY_BUTTON =
  "flex items-center justify-center gap-2 rounded-card bg-brand-pink px-5 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark";

/**
 * A title's own page, /movie/[id] or /series/[id]: poster and the main
 * action on the left, details on the right, then a series' episodes and
 * the recommendations. Series aren't a different product, just a
 * different metadata shape: Creator instead of Director, Seasons and
 * Episodes instead of a single Runtime, and "Start Watching" opens the
 * first episode, or "Continue" the one played last (SeriesPlayButton). Details a title doesn't have are left out.
 */
export default function TitleDetail({
  title,
  recommended,
}: {
  title: MediaDetail;
  recommended: Media[];
}) {
  const isSeries = title.type === "series";
  const { episodes } = title;
  const seasonCount = new Set(episodes.map((ep) => ep.seasonNumber)).size;
  const credit = isSeries ? title.creator : title.director;

  return (
    <main>
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          {/* Poster + main action */}
          <div className="mx-auto w-full max-w-[240px] shrink-0 md:mx-0 md:w-72">
            <div
              className={`relative aspect-2/3 w-full overflow-hidden rounded-card bg-bg-surface bg-linear-to-br ${title.gradient ?? ""}`}
            >
              <Image
                src={title.posterUrl}
                alt={title.title}
                fill
                priority
                sizes="288px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-bg-base/30 via-transparent to-transparent" />
            </div>

            <div className="mt-4">
              {!isSeries ? (
                <Link href={`/watch/${title.id}`} className={PLAY_BUTTON}>
                  <Play className="h-4 w-4 fill-current" />
                  Watch Now
                </Link>
              ) : episodes.length > 0 ? (
                <SeriesPlayButton episodes={episodes} className={PLAY_BUTTON} />
              ) : (
                <p className="rounded-card border border-border-subtle px-4 py-3 text-center text-sm font-semibold text-ink-secondary">
                  Episodes coming soon
                </p>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-baseline gap-2 font-display text-xl font-bold sm:text-2xl">
              {title.title}
              <span className="text-base font-normal text-ink-secondary">({title.year})</span>
            </h1>
            {title.rating !== undefined && (
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-pride-yellow">
                <Star className="h-4 w-4 fill-current" aria-hidden />
                <span className="sr-only">Rating: </span>
                <span>
                  {title.rating.toFixed(1)}
                  <span className="font-normal text-ink-muted">/5</span>
                </span>
              </p>
            )}

            {title.tagline && (
              <p className="mt-1 text-sm italic leading-snug text-ink-muted">{title.tagline}</p>
            )}

            {title.synopsis && (
              <div className="mt-3 max-w-2xl">
                <ReadMoreText text={title.synopsis} />
              </div>
            )}

            <dl className="mt-4 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm leading-snug sm:grid-cols-[140px_1fr]">
              {title.genres.length > 0 && (
                <>
                  <dt className="text-ink-muted">Genre</dt>
                  <dd className="text-ink-primary">
                    <MetaLinkList items={title.genres} href={genreHref} />
                  </dd>
                </>
              )}

              {credit && (
                <>
                  <dt className="text-ink-muted">{isSeries ? "Creator" : "Director"}</dt>
                  <dd className="text-ink-primary">
                    <MetaLink href={searchHref(credit)}>{credit}</MetaLink>
                  </dd>
                </>
              )}

              {title.cast.length > 0 && (
                <>
                  <dt className="text-ink-muted">Cast</dt>
                  <dd className="text-ink-primary">
                    <MetaLinkList items={title.cast} href={searchHref} />
                  </dd>
                </>
              )}

              <dt className="text-ink-muted">Country</dt>
              <dd className="text-ink-primary">
                <MetaLink href={countryHref(title.country)}>{title.country}</MetaLink>
              </dd>

              <dt className="text-ink-muted">Language</dt>
              <dd className="text-ink-primary">
                <MetaLink href={languageHref(title.language)}>{title.language}</MetaLink>
              </dd>

              {title.releaseDate && (
                <>
                  <dt className="text-ink-muted">Release Date</dt>
                  <dd className="text-ink-primary">{title.releaseDate}</dd>
                </>
              )}

              {isSeries ? (
                episodes.length > 0 && (
                  <>
                    <dt className="text-ink-muted">Seasons</dt>
                    <dd className="text-ink-primary">
                      {seasonCount === 1 ? "1 Season" : `${seasonCount} Seasons`}
                    </dd>

                    <dt className="text-ink-muted">Episodes</dt>
                    <dd className="text-ink-primary">{episodes.length}</dd>
                  </>
                )
              ) : (
                <>
                  <dt className="text-ink-muted">Runtime</dt>
                  <dd className="text-ink-primary">
                    {title.runtimeMinutes ? `${title.runtimeMinutes} min` : title.duration}
                  </dd>
                </>
              )}
            </dl>

            <TagList tags={title.tags} className="mt-4" />

            <TitleActions
              className="mt-4"
              media={{
                id: title.id,
                title: title.title,
                year: title.year,
                duration: title.duration,
                type: title.type,
                genre: title.genre,
                posterUrl: title.posterUrl,
                gradient: title.gradient,
              }}
            />
          </div>
        </div>

        {/* Season-tabbed episode list, below the poster + details block */}
        {episodes.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-semibold">Episodes</h2>
            <div className="mt-4">
              <SeasonTabs episodes={episodes} />
            </div>
          </div>
        )}
      </div>

      {recommended.length > 0 && (
        <>
          <hr className="mx-auto max-w-[1440px] border-border-subtle" />
          <div className="pb-16">
            <RecommendationSection media={recommended} />
          </div>
        </>
      )}
    </main>
  );
}
