import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { findEpisode } from "@/lib/mock-series-details";
import ServerTabs from "@/components/ServerTabs";
import WatchPlayer from "@/components/WatchPlayer";
import { MetaLink, MetaLinkList } from "@/components/MetaLink";

// Same rotation as /watch/[id] and /series/[id] — kept in sync
// intentionally.
const TAG_COLORS = [
  "bg-pride-red-light",
  "bg-pride-yellow",
  "bg-pride-green-light",
  "bg-pride-blue-light",
  "bg-pride-purple-light",
];

/**
 * Deliberately the same structure as /watch/[id]: player up top, then
 * server tabs, then a mini-poster + title/tags header, then synopsis +
 * meta list. The two adaptations from the movie version, since an
 * episode isn't a movie:
 *   1. No per-episode rating/tagline exists in the data model (only the
 *      series as a whole has one) — the header shows a "SX · EY" badge
 *      instead of a star rating, and the synopsis/meta list below shows
 *      the series' own info (genre/creator/cast/country/language),
 *      since that's genuinely shared across every episode.
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
  const found = findEpisode(id);
  if (!found) notFound();
  const { episode, series } = found;

  const sortedEpisodes = [...series.episodes].sort(
    (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
  );
  const currentIndex = sortedEpisodes.findIndex((ep) => ep.id === episode.id);
  const previous = currentIndex > 0 ? sortedEpisodes[currentIndex - 1] : undefined;
  const next =
    currentIndex < sortedEpisodes.length - 1 ? sortedEpisodes[currentIndex + 1] : undefined;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      {/* Player — placeholder, no real video source yet. Play button
          (inside WatchPlayer) is real: it records a History entry. */}
      <WatchPlayer
        media={{
          id: episode.id,
          title: `${series.title}: ${episode.title}`,
          year: series.year,
          duration: episode.duration,
          type: "series",
          kind: "episode",
          genre: series.genre[0] ?? "Uncategorized",
          gradient: series.gradient,
        }}
      />

      {/* Previous / Next episode — label on top so it's clear at a
          glance this is navigation, not just a title link; season/
          episode number included since "Next" alone doesn't say which
          one. */}
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
            className="flex flex-1 shrink-0 items-center gap-2 rounded-card border border-border-subtle px-4 py-2.5 text-sm font-semibold text-ink-disabled sm:flex-none"
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
            className="flex flex-1 shrink-0 items-center justify-end gap-2 rounded-card border border-border-subtle px-4 py-2.5 text-sm font-semibold text-ink-disabled sm:flex-none"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Server tabs — which sources exist per title will be configured
          on the (future) admin edit page */}
      <div className="mt-4">
        <ServerTabs />
      </div>

      {/* Mini poster + title/season-episode badge/tags */}
      <div className="mt-8 flex gap-4 sm:gap-6">
        <div
          className={`aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-card bg-bg-surface bg-gradient-to-br sm:w-32 ${series.gradient}`}
        />
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

          <div className="mt-3 flex flex-wrap gap-2">
            {series.tags.map((tag, i) => (
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

      {/* Series synopsis — shared across every episode, since there's
          no per-episode synopsis in the data model */}
      <p className="max-w-3xl text-sm leading-relaxed text-ink-secondary">
        {series.synopsis}
      </p>

      <dl className="mt-8 grid max-w-2xl grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
        <dt className="text-ink-muted">Genre</dt>
        <dd className="text-ink-primary">
          <MetaLinkList items={series.genre} />
        </dd>

        <dt className="text-ink-muted">Creator</dt>
        <dd className="text-ink-primary">
          <MetaLink>{series.creator}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Cast</dt>
        <dd className="text-ink-primary">
          <MetaLinkList items={series.cast} />
        </dd>

        <dt className="text-ink-muted">Country</dt>
        <dd className="text-ink-primary">
          <MetaLink>{series.country}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Language</dt>
        <dd className="text-ink-primary">
          <MetaLink>{series.language}</MetaLink>
        </dd>

        <dt className="text-ink-muted">Air Date</dt>
        <dd className="text-ink-primary">{episode.airDate ?? "—"}</dd>

        <dt className="text-ink-muted">Runtime</dt>
        <dd className="text-ink-primary">{episode.duration}</dd>
      </dl>
    </main>
  );
}
