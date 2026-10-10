"use client";

import { usePersistedState } from "@/lib/use-persisted-state";
import { useAuth } from "@/lib/auth-context";

const STORAGE_KEY = "gayflix:reports";

export const GUEST_REPORT_LIMIT = 1;
export const LOGGED_IN_REPORT_LIMIT = 5;

type ReportRecord = { date: string; count: number };

const NO_REPORTS: ReportRecord = { date: "", count: 0 };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, resets at UTC midnight
}

/**
 * Plain hook, not a Context — unlike Favorites/Lists/History, nothing
 * here needs multiple simultaneously-mounted components to stay in
 * sync with each other (there's only ever one player, and one Report
 * modal, on screen at a time). usePersistedState already gives this
 * real localStorage persistence on its own.
 *
 * There's no real per-account identity in this scaffold (isLoggedIn is
 * a single global flag, not a user id) — so "5 reports/day for logged-
 * in users" really means "5 reports/day for this browser, while
 * logged in," same limitation every other localStorage-backed feature
 * here has. Real per-user limits need a real backend.
 *
 * The stored date is compared against today on every read, not
 * corrected in storage until the next actual report — so the count
 * effectively resets at UTC midnight without needing a separate reset
 * step anywhere.
 */
export function useReportLimit() {
  const { isLoggedIn } = useAuth();
  const [record, setRecord] = usePersistedState<ReportRecord>(STORAGE_KEY, NO_REPORTS);

  const limit = isLoggedIn ? LOGGED_IN_REPORT_LIMIT : GUEST_REPORT_LIMIT;
  const countToday = record.date === todayKey() ? record.count : 0;
  const remaining = Math.max(0, limit - countToday);
  const canReport = remaining > 0;

  function recordReport() {
    const today = todayKey();
    setRecord((prev) => ({
      date: today,
      count: prev.date === today ? prev.count + 1 : 1,
    }));
  }

  return { limit, remaining, canReport, recordReport, isLoggedIn };
}
