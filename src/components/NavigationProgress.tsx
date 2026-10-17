"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Gives up if a page never arrives (the click may have been cancelled). */
const GIVE_UP_MS = 15_000;

/**
 * A thin bar along the top of the window from a click on a link to
 * another page until that page arrives, so a click never looks dead
 * while the server renders. It starts on clicks the browser would follow
 * in this tab, and ends when the address changes.
 *
 * Not loading.tsx skeletons: a loading boundary makes a page stream, and
 * a streamed page can no longer answer 404 for an unknown title.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const here = `${pathname}?${searchParams}`;
  // The address a click left from; the bar shows until the address changes.
  const [leaving, setLeaving] = useState<string | null>(null);
  // Arrived: forget the old address, so coming back to it later (Back)
  // doesn't show the bar again.
  if (leaving !== null && leaving !== here) setLeaving(null);
  const pending = leaving === here;
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const to = new URL(link.href);
      const { origin, pathname, search } = window.location;
      if (to.origin !== origin) return;
      if (to.pathname === pathname && to.search === search) return;
      setLeaving(hereRef.current);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setLeaving(null), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div className="nav-progress h-full origin-left bg-brand-pink" />
    </div>
  );
}
