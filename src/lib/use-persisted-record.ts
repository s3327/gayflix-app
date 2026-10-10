"use client";

import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * localStorage-backed record state, shared by every "no backend yet"
 * keyed-collection feature (Favorites, Lists, History, and whatever's
 * next). Thin wrapper over usePersistedState — that hook handles any
 * JSON-serializable value, this just fixes the shape to
 * Record<string, T> and the initial value to {}, which is what every
 * current caller needs.
 *
 * `key` is assumed static for the lifetime of a given call site — every
 * current caller passes a hardcoded "gayflix:..." string literal, never
 * a variable, so there's no case where it should change mid-session.
 */
// One shared empty record, so usePersistedState gets a stable
// initialValue instead of a fresh {} every render.
const EMPTY_RECORD: Record<string, never> = Object.freeze({});

export function usePersistedRecord<T extends Record<string, unknown>>(
  key: string
): [Record<string, T>, React.Dispatch<React.SetStateAction<Record<string, T>>>] {
  return usePersistedState<Record<string, T>>(key, EMPTY_RECORD);
}
