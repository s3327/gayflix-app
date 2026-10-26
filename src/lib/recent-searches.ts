import { normalizeQuery } from "@/lib/search";

/*
 * Recent searches (A13): the last few things searched in this browser,
 * shown when the header's search box opens empty. Kept in local storage
 * only (never sent anywhere), so each device has its own and clearing
 * them is the visitor's call.
 */

const KEY = "gayflix:recent-searches";
export const MAX_RECENT_SEARCHES = 5;

/** `list` with `query` first, without another copy of it (any case), at most MAX_RECENT_SEARCHES. */
export function withRecentSearch(list: string[], query: string): string[] {
  const text = normalizeQuery(query);
  if (!text) return list;
  const others = list.filter((item) => item.toLowerCase() !== text.toLowerCase());
  return [text, ...others].slice(0, MAX_RECENT_SEARCHES);
}

/** What's saved, newest first; empty when storage is off or holds something else. */
export function readRecentSearches(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

function save(list: string[]) {
  try {
    if (list.length > 0) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage off or full: recent searches just aren't kept.
  }
}

export function addRecentSearch(query: string) {
  save(withRecentSearch(readRecentSearches(), query));
}

export function clearRecentSearches() {
  save([]);
}
