/**
 * The 3/4/6-column responsive grid shared by Trending, New Releases, and
 * Genre — 24 items divides evenly into all three column counts (8/6/4
 * rows), which is why all three pages use this exact grid.
 */
export default function MediaGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6 lg:grid-cols-6">
      {children}
    </div>
  );
}
