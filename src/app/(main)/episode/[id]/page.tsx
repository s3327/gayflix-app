import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getEpisode, getVideoSources } from "@/lib/catalog";
import WatchPlayer from "@/components/WatchPlayer";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";
import TagList from "@/components/TagList";
import { countryHref, genreHref, languageHref, searchHref } from "@/lib/browse-href";
import { episodeMetadata } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const found = await getEpisode((await params).id);
  return found ? episodeMetadata(found.episode, found.series) : {};
}

/**
 * Deliberately the same structure as /watch/[id]: player (with its
 * server tabs) up top, then a mini-poster + title/tags header, then
 * synopsis + meta list. The two adaptations from the movie version, since an
 * episode isn't a movie:
 *   1. No per-episode rating/tagline exists in the data model (only the
 *      series as a whole has one) — the header shows a "SX · EY" badge
 *      instead of a star rating, and the synopsis/meta list below shows
 *      the series' own info (genre/creator/cast/country/language),
 *      since that's genuinely shared across every episode. Details the
 *      series doesn't have are left out.
 *   2. Previous/Next episode buttons directly below the player, since
 *      that's the one navigation action a movie's watch page has no
 *      equivalent for.
 */
export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [found, sources] = await Promise.all([getEpisode(id), getVideoSources({ episodeId: id })]);
  if (!found) notFound();
  const { episode, series } = found;

  // Already in season and episode order.
  const episodes = series.episodes;
  const currentIndex = episodes.findIndex((ep) => ep.id === episode.id);
  const previous = currentIndex > 0 ? episodes[currentIndex - 1] : undefined;
  const next = currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : undefined;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      {/* Player and its server tabs. Play (inside WatchPlayer) records a
          History entry. Keyed so the next episode starts on its own
          first server, not playing. */}
      <WatchPlayer
        key={episode.id}
        media={{
          id: episode.id,
          title: `${series.title}: ${episode.title}`,
          year: series.year,
          duration: episode.duration,
          type: "series",
          kind: "episode",
          genre: series.genre,
          gradient: series.gradient,
          posterUrl: series.posterUrl,
        }}
        sources={sources}
        backdropUrl={series.backdropUrl}
      />

      {/* Previous / Next episode — label on top so it's clear at a
          glance this is navigation, not just a title link; season/
          episode number included since "Next" alone doesn't say which
          one. At the first or last episode, the missing one shrinks to
          its label so the other has room for its title on phones. */}
      <div className="mt-4 flex items-stretch justify-between gap-3">
        {previous ? (
          <Link
            href={`/episode/${previous.id}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-card border border-border-strong px-4 py-2.5 transition-colors hover:bg-bg-elevated sm:flex-none sm:max-w-[45%]"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 text-ink-secondary" />
            <span className="min-w-0 text-left">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Previous
              </span>
              <span className="block truncate text-sm font-semibold text-ink-primary">
                S{previous.seasonNumber} · E{previous.episodeNumber} — {previous.title}
              </span>
            </span>
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="flex shrink-0 items-center gap-2 rounded-card border border-border-subtle px-4 py-2.5 text-sm font-semibold text-ink-disabled"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </span>
        )}

        {next ? (
          <Link
            href={`/episode/${next.id}`}
            className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-card border border-border-strong px-4 py-2.5 transition-colors hover:bg-bg-elevated sm:flex-none sm:max-w-[45%]"
          >
            <span className="min-w-0 text-right">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Next
              </span>
              <span className="block truncate text-sm font-semibold text-ink-primary">
                S{next.seasonNumber} · E{next.episodeNumber} — {next.title}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-secondary" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="flex shrink-0 items-center justify-end gap-2 rounded-card border border-border-subtle px-4 py-2.5 text-sm font-semibold text-ink-disabled"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Mini poster + title/season-episode badge/tags */}
      <div className="mt-8 flex gap-4 sm:gap-6">
        <div
          className={`relative aspect-2/3 w-24 shrink-0 overflow-hidden rounded-card bg-bg-surface bg-linear-to-br sm:w-32 ${series.gradient ?? ""}`}
        >
          <Image
            src={series.posterUrl}
            alt={series.title}
            fill
            sizes="128px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <Link
            href={`/series/${series.id}`}
            className="text-xs font-semibold uppercase tracking-wide text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            {series.title}
          </Link>

          <h1 className="mt-1 flex flex-wrap items-baseline gap-2 font-display text-xl font-bold sm:text-2xl">
            {episode.title}
            <span className="text-base font-normal text-ink-secondary">
              S{episode.seasonNumber} · E{episode.episodeNumber}
            </span>
          </h1>

          <p className="mt-1 text-sm text-ink-muted">
            {episode.duration}
            {episode.airDate ? ` · ${episode.airDate}` : ""}
          </p>

          <TagList tags={series.tags} className="mt-3" />
        </div>
      </div>

      <hr className="my-8 border-border-subtle" />

      {/* Series synopsis — shared across every episode, since there's
          no per-episode synopsis in the data model */}
      {series.synopsis && (
        <p className="max-w-3xl text-sm leading-relaxed text-ink-secondary">
          {series.synopsis}
        </p>
      )}

      <dl className="mt-8 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
        {series.genres.length > 0 && (
          <>
            <dt className="text-ink-muted">Genre</dt>
            <dd className="text-ink-primary">
              <MetaLinkList items={series.genres} href={genreHref} />
            </dd>
          </>
        )}

        {series.creator && (
          <>
            <dt className="text-ink-muted">Creator</dt>
            <dd className="text-ink-primary">
              <MetaLink href={searchHref(series.creator)}>{series.creator}</MetaLink>
            </dd>
          </>
        )}

        {series.cast.length > 0 && (
          <>
            <dt className="text-ink-muted">Cast</dt>
            <dd className="text-ink-primary">
              <MetaLinkList items={series.cast} href={searchHref} />
            </dd>
          </>
        )}

        <dt className="text-ink-muted">Country</dt>
        <dd className="text-ink-primary">
          <MetaLink href={countryHref(series.country)}>{series.country}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Language</dt>
        <dd className="text-ink-primary">
          <MetaLink href={languageHref(series.language)}>{series.language}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Air Date</dt>
        <dd className="text-ink-primary">{episode.airDate ?? "—"}</dd>

        <dt className="text-ink-muted">Runtime</dt>
        <dd className="text-ink-primary">{episode.duration}</dd>
      </dl>
    </main>
  );
}
