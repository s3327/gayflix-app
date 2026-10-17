"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * This page's path with its query string ("/browse?genre=Drama"), for
 * links to /login and /signup that come back here. Every page renders
 * per request (the root layout awaits connection()), so reading the
 * search params needs no Suspense boundary.
 */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return searchParams.size > 0 ? `${pathname}?${searchParams}` : pathname;
}
