import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Media } from "@/lib/media";
import PosterCard from "@/components/PosterCard";

const MAX_VISIBLE = 12;

/**
 * Generic fixed 12-card grid section — originally built for New Releases,
 * now shared by New Releases, Movies, and Series (same structure, same
 * responsive behavior, just a different heading and dataset):
 *   - Desktop (lg+):  6 columns × 2 rows, centered
 *   - Tablet (sm–lg): 4 columns × 3 rows
 *   - Mobile (<sm):   3 columns × 4 rows
 * No scrolling anywhere — 12 divides evenly by every breakpoint's column
 * count, so the grid just wraps to the right row count on its own.
 */
export default function TitleGridSection({
  title,
  media,
  seeMoreHref,
}: {
  title: string;
  media: Media[];
  /** Only New Releases has a real destination (/new-releases) so far —
   *  Movies/Series fall back to the non-functional button until they
   *  have their own full-listing pages. */
  seeMoreHref?: string;
}) {
  const visible = media.slice(0, MAX_VISIBLE);

  return (
    <section className="mt-10 sm:mt-12">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {seeMoreHref ? (
          <Link
            href={seeMoreHref}
            className="flex items-center gap-1 text-sm font-semibold text-brand-pink transition-colors hover:text-brand-pink-light"
          >
            See More
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          // No route yet — visual only
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-semibold text-brand-pink transition-colors hover:text-brand-pink-light"
          >
            See More
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mx-auto mt-4 grid max-w-[1440px] grid-cols-3 gap-3 px-4 sm:grid-cols-4 sm:gap-4 sm:px-8 lg:grid-cols-6">
        {visible.map((m) => (
          <PosterCard key={m.id} media={m} />
        ))}
      </div>
    </section>
  );
}
