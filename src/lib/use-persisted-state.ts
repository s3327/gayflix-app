"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Generic localStorage-backed state for any JSON-serializable value —
 * more general than usePersistedRecord (which is specifically for
 * Record<string, T> shapes like Favorites/Lists/History). Auth's
 * isLoggedIn is just a boolean, so it needs this rather than the
 * record-shaped one.
 *
 * Built on useSyncExternalStore rather than "load in an effect, save in
 * another effect":
 *  - no setState-in-effect cascade on mount;
 *  - every hook instance reading the same key stays in sync (two
 *    components calling useReportLimit see the same count);
 *  - other tabs' writes arrive through the `storage` event, so logging
 *    out in one tab logs out the others.
 *
 * The server snapshot is always "nothing stored", so the server render
 * and the hydration pass both use `initialValue`; React then re-renders
 * with the stored value straight after hydration.
 *
 * `initialValue` should be referentially stable (a primitive or a
 * module-level constant) — it's a dependency of the parsed value.
 */

// Writes that couldn't reach localStorage (private mode, quota full)
// still need to be visible for the rest of the session, so every write
// lands here first. A `storage` event from another tab clears the key so
// the next read goes back to localStorage.
const memory = new Map<string, string | null>();
const listeners = new Map<string, Set<() => void>>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string) {
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Storage full/unavailable — the in-memory copy above keeps it
    // working for this session, it just won't survive a reload.
  }
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string, listener: () => void) {
  let keyListeners = listeners.get(key);
  if (!keyListeners) {
    keyListeners = new Set();
    listeners.set(key, keyListeners);
  }
  keyListeners.add(listener);

  function handleStorage(event: StorageEvent) {
    // event.key is null when another tab calls localStorage.clear().
    if (event.key === key || event.key === null) {
      memory.delete(key);
      listener();
    }
  }
  window.addEventListener("storage", handleStorage);

  return () => {
    keyListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt storage — start with the fallback rather than crash.
    return fallback;
  }
}

export function usePersistedState<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const raw = useSyncExternalStore(
    useCallback((listener) => subscribe(key, listener), [key]),
    () => readRaw(key),
    () => null
  );

  const value = useMemo(() => parse(raw, initialValue), [raw, initialValue]);

  const setValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      // Read the latest stored value at call time (not the value from
      // this render), so back-to-back updates compose correctly.
      const current = parse(readRaw(key), initialValue);
      const next =
        typeof action === "function"
          ? (action as (previous: T) => T)(current)
          : action;
      writeRaw(key, JSON.stringify(next));
    },
    [key, initialValue]
  );

  return [value, setValue];
}
