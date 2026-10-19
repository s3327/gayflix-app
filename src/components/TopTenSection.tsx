import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";
import SwipeableRow from "@/components/SwipeableRow";

/**
 * Top 10 This Week on the home page: this week's most watched titles
 * (getHome's topTen, src/lib/catalog.ts), most first, each beside a big
 * outlined number. One swipeable row at every size, about 2, 3 and 5
 * showing on phones, tablets and desktops. See More goes to /trending,
 * which ranks the top 100.
 *
 * The row is a numbered list, so screen readers hear each title's place;
 * the big numbers are drawing only. Sizes are in cqw (each item is a
 * size container), so the number keeps its size against the poster at
 * any width.
 */
export default function TopTenSection({ media }: { media: Media[] }) {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <h2 className="font-display text-xl font-semibold">Top 10 This Week</h2>
        <Link
          href="/trending"
          className="flex items-center gap-1 text-sm font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
        >
          See More
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mx-auto max-w-[1440px]">
        <SwipeableRow
          as="ol"
          className="mt-2 flex gap-3 overflow-x-auto px-4 py-2 snap-x snap-mandatory scrollbar-none sm:gap-4 sm:px-8"
        >
          {media.map((m, index) => {
            const rank = index + 1;
            return (
              <li
                key={m.id}
                className="@container flex shrink-0 basis-[46%] snap-start items-end sm:basis-[31%] lg:basis-[21%]"
              >
                {/* An outline only: the stroke is drawn first and the
                    page-coloured fill over its inner half, which also
                    hides where the font's shapes overlap inside "1". */}
                <span
                  aria-hidden
                  className={`w-[48%] shrink-0 select-none pb-11 text-right font-display font-bold leading-[0.72] text-bg-base [paint-order:stroke_fill] [-webkit-text-stroke:4px_var(--color-brand-pink)] ${
                    rank < 10 ? "text-[90cqw]" : "text-[52cqw] tracking-[-0.1em]"
                  }`}
                >
                  {rank}
                </span>
                {/* Over the number's right edge, as on a ranked shelf. The
                    background keeps the number from showing through a
                    poster that hasn't loaded. */}
                <div className="relative -ml-[4%] w-[56%] min-w-0 bg-bg-base">
                  <PosterCard media={m} />
                </div>
              </li>
            );
          })}
        </SwipeableRow>
      </div>
    </section>
  );
}
