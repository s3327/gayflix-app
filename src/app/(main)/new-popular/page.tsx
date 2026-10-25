import type { Metadata } from "next";
import ContentRow from "@/components/ContentRow";
import TopTenSection from "@/components/TopTenSection";
import { getNewAndPopular } from "@/lib/catalog";
import { listingMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = listingMetadata(
  "New & Popular",
  "/new-popular",
  "This week's Top 10, what's just been added, and the most watched LGBTQ+ films and series on Gayflix."
);

/**
 * New & Popular, in the header: this week's Top 10, the newest titles and
 * the most watched of all time, each row leading to its whole list
 * (/trending, /new-releases, and Browse, which sorts by most popular).
 */
export default async function NewAndPopularPage() {
  const { topTen, recentlyAdded, mostWatched } = await getNewAndPopular();

  return (
    <main className="pb-20">
      <div className="mx-auto max-w-[1440px] px-4 pt-10 sm:px-8 sm:pt-14">
        <h1 className="font-display text-3xl font-bold">New &amp; Popular</h1>
      </div>
      {topTen.length > 0 && <TopTenSection media={topTen} />}
      {recentlyAdded.length > 0 && (
        <ContentRow heading="Recently Added" media={recentlyAdded} seeMoreHref="/new-releases" />
      )}
      {mostWatched.length > 0 && (
        <ContentRow heading="Most Watched" media={mostWatched} seeMoreHref="/browse" />
      )}
    </main>
  );
}
