import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";
import SwipeableRow from "@/components/SwipeableRow";

/**
 * A row of titles that scrolls sideways (the home page's and New &
 * Popular's rows): one swipeable row at every size, about 3, 4 and 6
 * cards showing on phones, tablets and desktops, with arrows on the
 * edges that have more. `heading` is the row's h2 content; `seeMoreHref`
 * adds See More, to the whole list.
 */
export default function ContentRow({
  heading,
  media,
  seeMoreHref,
}: {
  heading: React.ReactNode;
  media: Media[];
  seeMoreHref?: string;
}) {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
        <h2 className="min-w-0 font-display text-xl font-semibold">{heading}</h2>
        {seeMoreHref && (
          <Link
            href={seeMoreHref}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
          >
            See More
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      <div className="mx-auto max-w-[1440px]">
        <SwipeableRow className="mt-2 flex gap-3 overflow-x-auto px-4 py-2 snap-x snap-mandatory scrollbar-none sm:gap-4 sm:px-8">
          {media.map((m) => (
            <div key={m.id} className="basis-[30%] shrink-0 snap-start sm:basis-[23%] lg:basis-[15.5%]">
              <PosterCard media={m} />
            </div>
          ))}
        </SwipeableRow>
      </div>
    </section>
  );
}
