import Image from "next/image";
import Link from "next/link";
import { Play, Info } from "lucide-react";
import ContinueWatchingSection from "@/components/ContinueWatchingSection";
import TrendingNowSection from "@/components/TrendingNowSection";
import TitleGridSection from "@/components/TitleGridSection";
import { getHome, listContinueWatching } from "@/lib/catalog";
import { titleHref } from "@/lib/title-href";

export default async function HomePage() {
  const [{ featured, trending, newReleases, movies, series }, continueWatching] =
    await Promise.all([getHome(), listContinueWatching()]);

  return (
    <main>
      {featured ? (
        /* Hero */
        <section className="relative h-[62vh] min-h-[420px] w-full overflow-hidden sm:h-[74vh]">
          {featured.backdropUrl && (
            <Image
              src={featured.backdropUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )}
          <div
            className={`absolute inset-0 bg-linear-to-br opacity-40 mix-blend-multiply ${featured.gradient ?? ""}`}
          />
          <div className="absolute inset-0 bg-linear-to-t from-bg-base via-bg-base/40 to-transparent" />
          <div className="absolute inset-0 bg-linear-to-r from-bg-base/80 via-transparent to-transparent" />

          <div className="relative flex h-full max-w-[1440px] flex-col justify-end px-4 pb-12 sm:px-8 sm:pb-16 lg:mx-auto">
            <p className="font-body text-sm font-semibold uppercase tracking-widest text-ink-secondary">
              Featured Today
            </p>
            <h1 className="mt-2 max-w-xl font-display text-4xl font-bold leading-tight sm:text-6xl sm:leading-none">
              {featured.title}
            </h1>
            <p className="mt-2 text-sm text-ink-secondary">
              {[featured.year, featured.genre, featured.duration].filter(Boolean).join(" · ")}
            </p>
            {/* Cut short so a long synopsis can't push the title up under
                the header or cover the backdrop; More Info has all of it. */}
            {featured.synopsis && (
              <p className="mt-4 line-clamp-3 max-w-lg text-ink-secondary sm:line-clamp-4">
                {featured.synopsis}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {/* /watch/[id] sends a series on to its first episode. */}
              <Link
                href={`/watch/${featured.id}`}
                className="flex items-center gap-2 rounded-card bg-brand-pink px-7 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </Link>
              <Link
                href={titleHref(featured)}
                className="flex items-center gap-2 rounded-card border border-border-strong bg-bg-base/40 px-7 py-3 font-body text-sm font-bold text-ink-primary backdrop-blur-sm transition-colors hover:bg-bg-elevated"
              >
                <Info className="h-4 w-4" />
                More Info
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
          <h1 className="font-display text-3xl font-bold">Nothing to watch yet</h1>
          <p className="mt-2 text-ink-secondary">Titles show up here once they&apos;re published.</p>
        </section>
      )}

      {/* Rows (a row with no titles is left out) */}
      <div className="pb-20">
        <ContinueWatchingSection items={continueWatching} />
        {trending.length > 0 && <TrendingNowSection media={trending} />}
        {newReleases.length > 0 && (
          <TitleGridSection title="Recently Added" media={newReleases} seeMoreHref="/new-releases" />
        )}
        {movies.length > 0 && <TitleGridSection title="Movies" media={movies} seeMoreHref="/movie" />}
        {series.length > 0 && (
          <TitleGridSection title="Series" media={series} seeMoreHref="/series" />
        )}
      </div>
    </main>
  );
}
