"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * False during the server render and the hydration pass, true from then
 * on (and immediately on client-side navigations). Lets a page tell
 * "browser storage hasn't been read yet" apart from "nothing is stored".
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}
