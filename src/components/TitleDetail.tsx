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
import ShareButton from "@/components/ShareButton";
import AddToListButton from "@/components/AddToListButton";
import FavoriteButton from "@/components/FavoriteButton";
import WatchlistButton from "@/components/WatchlistButton";
import TrailerButton from "@/components/TrailerButton";
import { countryHref, genreHref, languageHref, personHref } from "@/lib/browse-href";
import { contentNotesLabel, maturityLabel } from "@/lib/title-extras";

const PLAY_BUTTON =
  "flex h-12 items-center justify-center gap-2 rounded-card bg-brand-pink px-6 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark";
/** Trailer and Share, the same height as Watch Later and Add to List beside them. */
const ACTION_BASE =
  "flex h-12 shrink-0 items-center justify-center gap-2 rounded-card border border-border-strong bg-bg-base/40 text-ink-primary backdrop-blur-sm transition-colors hover:border-brand-pink hover:bg-bg-elevated";
const ACTION_BUTTON = `${ACTION_BASE} px-5`;
/** Share: a square, like Favorite beside it. */
const ICON_ACTION_BUTTON = `${ACTION_BASE} w-12`;

/**
 * A title's own page, /movie/[id] or /series/[id].
 *
 * The header comes first at every size: the backdrop, with the title, its
 * facts (year, maturity rating, length, genres, rating), the tagline and
 * the actions (Play, Trailer, Watch Later, Add to List, Favorite, Share)
 * over its lower edge, so Play is on the first screen of a phone. Wider screens
 * also show the poster beside them. A title with no backdrop gets its
 * poster, blurred, behind the header instead (and a phone shows the
 * poster itself in it).
 *
 * Below: the synopsis, what the title contains, the details, a series'
 * episodes and the recommendations. Series aren't a different product,
 * just a different metadata shape: Creator instead of Director, Seasons
 * and Episodes instead of a single Runtime, and "Start Watching" opens
 * the first episode, or "Continue" the one played last
 * (SeriesPlayButton). Details a title doesn't have are left out.
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
  const length = isSeries
    ? episodes.length > 0 && (seasonCount === 1 ? "1 Season" : `${seasonCount} Seasons`)
    : title.duration;
  const contains = contentNotesLabel(title.contentNotes);
  const entry = {
    id: title.id,
    title: title.title,
    year: title.year,
    duration: title.duration,
    type: title.type,
    genre: title.genre,
    posterUrl: title.posterUrl,
    gradient: title.gradient,
  };

  return (
    <main>
      {/* Header */}
      {/* No stacking context of its own (no isolate or z-index), so a
          dialog opened in it, the trailer's, stays above the site header. */}
      <section aria-labelledby="title-heading" className="relative overflow-hidden">
        {/* The backdrop: a 16:9 band on phones, behind the whole header
            from md up. The content comes after it, so it's drawn over it. */}
        <div
          className={`relative aspect-video w-full bg-bg-surface bg-linear-to-br md:absolute md:inset-0 md:aspect-auto ${title.gradient ?? ""}`}
        >
          {title.backdropUrl ? (
            <Image src={title.backdropUrl} alt="" fill priority sizes="100vw" className="object-cover" />
          ) : (
            <>
              <Image
                src={title.posterUrl}
                alt=""
                fill
                sizes="100vw"
                className="scale-110 object-cover opacity-50 blur-2xl"
              />
              {/* The poster itself, on phones; wider screens have it beside the title. */}
              <div className="absolute inset-y-4 left-1/2 aspect-2/3 -translate-x-1/2 overflow-hidden rounded-card shadow-xl md:hidden">
                <Image src={title.posterUrl} alt="" fill priority sizes="160px" className="object-cover" />
              </div>
            </>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-bg-base via-bg-base/30 to-transparent md:via-bg-base/50" />
          <div className="absolute inset-0 hidden bg-linear-to-r from-bg-base/90 via-bg-base/40 to-transparent md:block" />
        </div>

        <div className="relative mx-auto flex max-w-[1200px] items-end gap-8 px-4 pb-8 sm:px-8 md:min-h-[min(72vh,620px)] md:pb-12 md:pt-24">
          <div
            className={`relative hidden aspect-2/3 w-44 shrink-0 overflow-hidden rounded-card bg-bg-surface bg-linear-to-br shadow-xl md:block lg:w-52 ${title.gradient ?? ""}`}
          >
            <Image src={title.posterUrl} alt="" fill priority sizes="208px" className="object-cover" />
          </div>

          <div className="min-w-0 max-w-3xl">
            <h1
              id="title-heading"
              className="font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl"
            >
              {title.title}
            </h1>

            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-secondary">
              <span>{title.year}</span>
              {title.maturityRating && (
                <span
                  className="rounded-sm border border-ink-secondary/60 px-1.5 py-px text-xs font-semibold text-ink-primary"
                  title="Maturity rating"
                >
                  <span className="sr-only">Rated </span>
                  {maturityLabel(title.maturityRating)}
                </span>
              )}
              {length && <span>{length}</span>}
              {title.genres.length > 0 && <span>{title.genres.slice(0, 3).join(" · ")}</span>}
              {title.rating !== undefined && (
                <span className="flex items-center gap-1 font-semibold text-pride-yellow">
                  <Star className="h-4 w-4 fill-current" aria-hidden />
                  <span className="sr-only">Rating: </span>
                  {title.rating.toFixed(1)}
                  <span className="font-normal text-ink-muted">/5</span>
                </span>
              )}
            </p>

            {title.tagline && (
              <p className="mt-2 text-sm italic leading-snug text-ink-muted">{title.tagline}</p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {!isSeries ? (
                <Link href={`/watch/${title.id}`} className={`${PLAY_BUTTON} w-full sm:w-auto`}>
                  <Play className="h-4 w-4 fill-current" />
                  Watch Now
                </Link>
              ) : episodes.length > 0 ? (
                <SeriesPlayButton episodes={episodes} className={`${PLAY_BUTTON} w-full sm:w-auto`} />
              ) : (
                <p className="flex h-12 w-full items-center justify-center rounded-card border border-border-subtle px-5 text-sm font-semibold text-ink-secondary sm:w-auto">
                  Episodes coming soon
                </p>
              )}
              {/* A phone pairs Trailer and Watch Later, then Add to List
                  with Favorite and Share (icons, still named); one row on
                  wider screens. */}
              {title.trailerUrl && (
                <TrailerButton trailerUrl={title.trailerUrl} title={title.title} className={ACTION_BUTTON} />
              )}
              <WatchlistButton media={entry} />
              <AddToListButton media={entry} />
              <FavoriteButton media={entry} />
              <ShareButton title={title.title} className={ICON_ACTION_BUTTON} iconOnly />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-8 sm:pb-14">
        <div className="min-w-0 max-w-2xl">
          {title.synopsis && <ReadMoreText text={title.synopsis} />}

          {contains && (
            <p className="mt-3 text-sm text-ink-secondary">
              <span className="font-semibold text-ink-primary">Contains:</span> {contains}
            </p>
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
                  <MetaLink href={personHref(credit)}>{credit}</MetaLink>
                </dd>
              </>
            )}

            {title.cast.length > 0 && (
              <>
                <dt className="text-ink-muted">Cast</dt>
                <dd className="text-ink-primary">
                  <MetaLinkList items={title.cast} href={personHref} />
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
                  <dd className="text-ink-primary">{seasonCount}</dd>

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
        </div>

        {/* Season-tabbed episode list, below the details */}
        {episodes.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-semibold">Episodes</h2>
            <div className="mt-4">
              <SeasonTabs episodes={episodes} fallbackImageUrl={title.backdropUrl ?? title.posterUrl} />
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
