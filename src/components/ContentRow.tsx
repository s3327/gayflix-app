import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";
import SwipeableRow from "@/components/SwipeableRow";

/**
 * A home page row that scrolls sideways (Because You Watched): one
 * swipeable row at every size, 3, 4 and 6 cards showing on phones,
 * tablets and desktops, as wide as the home page's other rows. `heading`
 * is the row's h2 content.
 */
export default function ContentRow({
  heading,
  media,
}: {
  heading: React.ReactNode;
  media: Media[];
}) {
  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="mx-auto max-w-[1440px] px-4 font-display text-xl font-semibold sm:px-8">
        {heading}
      </h2>

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
