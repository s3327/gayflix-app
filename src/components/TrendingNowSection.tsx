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

      {/* Mobile (<sm): fixed 3x2 grid, all 6 titles, no scroll */}
      <div className="mt-4 grid grid-cols-3 gap-3 px-4 sm:hidden">
        {media.map((m) => (
          <PosterCard key={m.id} media={m} />
        ))}
      </div>

      {/* Tablet (sm–lg): swipeable row, ~4 visible of 6 */}
      <SwipeableRow className="mt-2 hidden gap-4 overflow-x-auto px-8 py-2 snap-x snap-mandatory scrollbar-none sm:flex lg:hidden">
        {media.map((m) => (
          <div key={m.id} className="shrink-0 basis-1/4 snap-start">
            <PosterCard media={m} />
          </div>
        ))}
      </SwipeableRow>

      {/* Desktop (lg+): all 6 in a single row, centered on screen */}
      <div className="mx-auto mt-4 hidden max-w-[1440px] grid-cols-6 gap-4 px-8 lg:grid">
        {media.map((m) => (
          <PosterCard key={m.id} media={m} />
        ))}
      </div>
    </section>
  );
}
