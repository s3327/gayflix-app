import Image from "next/image";
import Link from "next/link";
import { Play, Info } from "lucide-react";
import ContinueWatchingSection from "@/components/ContinueWatchingSection";
import TrendingNowSection from "@/components/TrendingNowSection";
import TitleGridSection from "@/components/TitleGridSection";
import { featuredTitle, trendingNow, newReleases, movies, series } from "@/lib/mock-titles";
import { continueWatching } from "@/lib/mock-continue-watching";
import { titleHref } from "@/lib/title-href";

export default function HomePage() {
  const moreInfoHref = titleHref(featuredTitle);

  return (
    <main>
      {/* Hero */}
      <section className="relative h-[62vh] min-h-[420px] w-full overflow-hidden sm:h-[74vh]">
        {featuredTitle.backdropUrl && (
          <Image
            src={featuredTitle.backdropUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div
          className={`absolute inset-0 bg-linear-to-br opacity-40 mix-blend-multiply ${featuredTitle.gradient}`}
        />
        <div className="absolute inset-0 bg-linear-to-t from-bg-base via-bg-base/40 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-bg-base/80 via-transparent to-transparent" />

        <div className="relative flex h-full max-w-[1440px] flex-col justify-end px-4 pb-12 sm:px-8 sm:pb-16 lg:mx-auto">
          <p className="font-body text-sm font-semibold uppercase tracking-widest text-ink-secondary">
            Featured Today
          </p>
          <h1 className="mt-2 max-w-xl font-display text-4xl font-bold leading-tight sm:text-6xl sm:leading-none">
            {featuredTitle.title}
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {featuredTitle.year} · {featuredTitle.genre} · {featuredTitle.duration}
          </p>
          <p className="mt-4 max-w-lg text-ink-secondary">
            {featuredTitle.synopsis}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/watch/${featuredTitle.id}`}
              className="flex items-center gap-2 rounded-card bg-brand-pink px-7 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              <Play className="h-4 w-4 fill-current" />
              Play
            </Link>
            <Link
              href={moreInfoHref}
              className="flex items-center gap-2 rounded-card border border-border-strong bg-bg-base/40 px-7 py-3 font-body text-sm font-bold text-ink-primary backdrop-blur-sm transition-colors hover:bg-bg-elevated"
            >
              <Info className="h-4 w-4" />
              More Info
            </Link>
          </div>
        </div>
      </section>

      {/* Rows */}
      <div className="pb-20">
        <ContinueWatchingSection items={continueWatching} />
        <TrendingNowSection media={trendingNow} />
        <TitleGridSection title="New Releases" media={newReleases} seeMoreHref="/new-releases" />
        <TitleGridSection title="Movies" media={movies} seeMoreHref="/movie" />
        <TitleGridSection title="Series" media={series} seeMoreHref="/series" />
      </div>
    </main>
  );
}
