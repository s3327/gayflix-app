"use client";

import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * localStorage-backed record state. Only a guest's watch history uses
 * it now; signed-in users keep their library in the database. Thin
 * wrapper over usePersistedState that fixes the shape to
 * Record<string, T> and the initial value to {}.
 *
 * `key` is assumed static for the lifetime of a given call site.
 */
// One shared empty record, so usePersistedState gets a stable
// initialValue instead of a fresh {} every render.
const EMPTY_RECORD: Record<string, never> = Object.freeze({});

export function usePersistedRecord<T extends Record<string, unknown>>(
  key: string
): [Record<string, T>, React.Dispatch<React.SetStateAction<Record<string, T>>>] {
  return usePersistedState<Record<string, T>>(key, EMPTY_RECORD);
}
