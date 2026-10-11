import type { RecentlyWatched } from "@/lib/media";
import ContinueWatchingCard from "@/components/ContinueWatchingCard";

const MAX_VISIBLE = 6;

/** The signed-in user's latest titles (listContinueWatching in src/lib/catalog.ts). */
export default function ContinueWatchingSection({ items }: { items: RecentlyWatched[] }) {
  if (items.length === 0) return null;

  // The visibility classes below expect at most 6.
  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="mb-4 px-4 font-display text-xl font-semibold sm:px-8">
        Continue Watching
      </h2>

      <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 sm:gap-4 sm:px-8 lg:grid-cols-6">
        {visible.map((item, index) => {
          // Keeps the row to exactly one row at every breakpoint instead of
          // wrapping: mobile shows the first 3, tablet the first 4,
          // desktop all 6 — matching each breakpoint's column count.
          const visibilityClass =
            index < 3 ? "" : index === 3 ? "hidden sm:block" : "hidden lg:block";

          return (
            <div key={item.id} className={visibilityClass}>
              <ContinueWatchingCard item={item} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
