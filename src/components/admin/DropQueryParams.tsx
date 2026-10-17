"use client";

import { useEffect } from "react";

/**
 * Takes one-time flags such as ?added=1 out of the address once the page
 * has shown their message, so a reload or a shared link doesn't repeat it.
 */
export default function DropQueryParams({ names }: { names: string[] }) {
  const key = names.join(",");
  useEffect(() => {
    const url = new URL(window.location.href);
    const flags = key.split(",");
    if (!flags.some((name) => url.searchParams.has(name))) return;
    for (const name of flags) url.searchParams.delete(name);
    // Next.js keeps its router in step with history.replaceState.
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [key]);
  return null;
}
