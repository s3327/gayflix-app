import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";
import SwipeableRow from "@/components/SwipeableRow";

const MAX_VISIBLE = 12;
// Narrower than the 1440px used by the home page's full-width rows —
// deliberately smaller/secondary, so recommendations don't compete with
// the main content for attention. Centered via mx-auto.
const CONTAINER = "mx-auto max-w-[1040px]";

/**
 * Recommendation row for detail pages. Unlike TitleGridSection (a static
 * grid, different layout per breakpoint), this is one swipeable row at
 * every breakpoint — mobile/tablet/desktop only differ in how many cards
 * are visible at once (3 / 4 / 6, via basis-*), not in the underlying
 * mechanism. All 12 are always in the DOM; SwipeableRow's chevrons +
 * native touch swipe + mouse drag handle revealing the rest.
 *
 * The titles come ranked from listRecommendations (src/lib/catalog.ts):
 * the ones sharing the most genres, tags and people come first.
 */
export default function RecommendationSection({ media }: { media: Media[] }) {
  const visible = media.slice(0, MAX_VISIBLE);

  return (
    <section className="mt-10 sm:mt-12">
      <div className={`${CONTAINER} px-4 sm:px-8`}>
        <h2 className="font-display text-xl font-semibold">You Might Also Like</h2>
      </div>

      <div className={CONTAINER}>
        <SwipeableRow className="mt-2 flex gap-3 overflow-x-auto px-4 py-2 snap-x snap-mandatory scrollbar-none sm:gap-4 sm:px-8">
          {visible.map((m) => (
            <div
              key={m.id}
              className="basis-1/3 shrink-0 snap-start sm:basis-1/4 lg:basis-1/6"
            >
              <PosterCard media={m} />
            </div>
          ))}
        </SwipeableRow>
      </div>
    </section>
  );
}
