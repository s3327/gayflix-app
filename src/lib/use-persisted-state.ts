"use client";

import { useEffect, useState } from "react";

/**
 * Generic localStorage-backed state for any JSON-serializable value —
 * more general than usePersistedRecord (which is specifically for
 * Record<string, T> shapes like Favorites/Lists/History). Auth's
 * isLoggedIn is just a boolean, so it needs this rather than the
 * record-shaped one.
 *
 * Same behavior as usePersistedRecord: load-on-mount, save-on-change
 * (suppressed until the initial load attempt finishes), defensive
 * try/catch throughout.
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      // Corrupt or inaccessible storage — start with initialValue rather
      // than crash.
    } finally {
      setHasLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full/unavailable — state still works for this session,
      // it just won't survive a reload.
    }
  }, [key, value, hasLoaded]);

  return [value, setValue];
}
