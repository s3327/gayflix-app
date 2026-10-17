import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";
import SwipeableRow from "@/components/SwipeableRow";

export default function TrendingNowSection({ media }: { media: Media[] }) {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <h2 className="font-display text-xl font-semibold">Trending Now</h2>
        <Link
          href="/trending"
          className="flex items-center gap-1 text-sm font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
        >
          See More
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* One set of cards for every screen: a 3 × 2 grid on phones, a
          swipeable row with about 4 showing on tablets, and all 6 in one
          row on desktops. */}
      <SwipeableRow className="mt-2 grid grid-cols-3 gap-3 px-4 py-2 sm:flex sm:gap-4 sm:overflow-x-auto sm:px-8 sm:snap-x sm:snap-mandatory scrollbar-none lg:mx-auto lg:grid lg:max-w-[1440px] lg:grid-cols-6 lg:overflow-visible">
        {media.map((m) => (
          <div key={m.id} className="min-w-0 sm:shrink-0 sm:basis-1/4 sm:snap-start lg:basis-auto">
            <PosterCard media={m} />
          </div>
        ))}
      </SwipeableRow>
    </section>
  );
}
