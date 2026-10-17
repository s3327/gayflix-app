import MediaGrid from "@/components/MediaGrid";

/*
 * Loading screens (the loading.tsx files under src/app/(main)): grey
 * blocks in the shape of the page that's coming, shown at once on a
 * click while the server renders it. Each one keeps the real page's
 * container, so nothing jumps when the page arrives.
 */

const BLOCK = "rounded-card bg-bg-surface motion-safe:animate-pulse";

function Loading({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <main aria-busy="true" className={className}>
      <p role="status" className="sr-only">
        Loading…
      </p>
      {children}
    </main>
  );
}

/** A listing: a heading and a grid of posters (Browse, New Releases, Search, ...). */
export function GridSkeleton() {
  return (
    <Loading className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className={`h-9 w-56 ${BLOCK}`} />
      <div className="mt-8">
        <MediaGrid>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i}>
              <div className={`aspect-2/3 w-full ${BLOCK}`} />
              <div className={`mt-2 h-4 w-3/4 ${BLOCK}`} />
              <div className={`mt-1 h-3 w-1/2 ${BLOCK}`} />
            </div>
          ))}
        </MediaGrid>
      </div>
    </Loading>
  );
}

/** A title's page (TitleDetail): poster and Play, then the details. */
export function TitleSkeleton() {
  return (
    <Loading className="mx-auto max-w-[1200px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <div className="mx-auto w-full max-w-[240px] shrink-0 md:mx-0 md:w-72">
          <div className={`aspect-2/3 w-full ${BLOCK}`} />
          <div className={`mt-4 h-11 w-full ${BLOCK}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`h-8 w-2/3 ${BLOCK}`} />
          <div className={`mt-4 h-4 w-full max-w-2xl ${BLOCK}`} />
          <div className={`mt-2 h-4 w-5/6 max-w-2xl ${BLOCK}`} />
          <div className="mt-6 flex max-w-2xl flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={`h-4 w-1/2 ${BLOCK}`} />
            ))}
          </div>
        </div>
      </div>
    </Loading>
  );
}

/** A watch or episode page: the player, then the title's header. */
export function WatchSkeleton() {
  return (
    <Loading className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      <div className={`aspect-video w-full ${BLOCK}`} />
      <div className="mt-8 flex gap-4 sm:gap-6">
        <div className={`aspect-2/3 w-24 shrink-0 sm:w-32 ${BLOCK}`} />
        <div className="min-w-0 flex-1">
          <div className={`h-7 w-2/3 ${BLOCK}`} />
          <div className={`mt-3 h-4 w-1/3 ${BLOCK}`} />
        </div>
      </div>
    </Loading>
  );
}
