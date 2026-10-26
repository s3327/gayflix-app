import type { Metadata } from "next";
import ContentRow from "@/components/ContentRow";
import ContinueWatchingSection from "@/components/ContinueWatchingSection";
import HeroCarousel from "@/components/HeroCarousel";
import TopTenSection from "@/components/TopTenSection";
import {
  getHome,
  listBecauseYouWatched,
  listContinueWatching,
  listHomeCollections,
  type BecauseYouWatched,
} from "@/lib/catalog";
import { listingMetadata } from "@/lib/page-metadata";

/** A Because You Watched row says why it's there. */
const BECAUSE_HEADINGS: Record<BecauseYouWatched["seed"]["reason"], string> = {
  watched: "Because You Watched",
  like: "Because You Liked",
  love: "Because You Loved",
};

export const metadata: Metadata = listingMetadata(
  "Home",
  "/home",
  "What's new, trending and worth watching on Gayflix: LGBTQ+ films and series."
);

export default async function HomePage() {
  const [
    { heroes, topTen, newReleases, movies, series },
    continueWatching,
    becauseYouWatched,
    collections,
  ] = await Promise.all([
    getHome(),
    listContinueWatching(),
    listBecauseYouWatched(),
    listHomeCollections(),
  ]);

  return (
    <main>
      {heroes.length > 0 ? (
        <HeroCarousel heroes={heroes} />
      ) : (
        <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
          <h1 className="font-display text-3xl font-bold">Nothing to watch yet</h1>
          <p className="mt-2 text-ink-secondary">Titles show up here once they&apos;re published.</p>
        </section>
      )}

      {/* Rows (a row with no titles is left out), each scrolling sideways */}
      <div className="pb-20">
        <ContinueWatchingSection items={continueWatching} />
        {topTen.length > 0 && <TopTenSection media={topTen} />}
        {becauseYouWatched.map(({ seed, media }) => (
          <ContentRow
            key={seed.id}
            heading={
              <>
                {BECAUSE_HEADINGS[seed.reason]} <span className="text-ink-brand">{seed.title}</span>
              </>
            }
            media={media}
          />
        ))}
        {collections.map((collection) => (
          <ContentRow
            key={collection.id}
            heading={collection.title}
            media={collection.media}
            seeMoreHref={`/collections/${collection.id}`}
          />
        ))}
        {newReleases.length > 0 && (
          <ContentRow heading="Recently Added" media={newReleases} seeMoreHref="/new-releases" />
        )}
        {movies.length > 0 && <ContentRow heading="Movies" media={movies} seeMoreHref="/movie" />}
        {series.length > 0 && <ContentRow heading="Series" media={series} seeMoreHref="/series" />}
      </div>
    </main>
  );
}
