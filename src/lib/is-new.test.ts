import { afterEach, describe, expect, it, vi } from "vitest";
import { isRecentlyAdded } from "@/lib/is-new";
import { newBadgeConfig } from "@/lib/new-badge-config";

const DAY = 24 * 60 * 60 * 1000;

describe("isRecentlyAdded", () => {
  afterEach(() => vi.useRealTimers());

  it("is true inside the configured period and false after it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    const now = Date.now();
    expect(isRecentlyAdded(new Date(now - DAY).toISOString())).toBe(true);
    expect(
      isRecentlyAdded(new Date(now - (newBadgeConfig.periodDays + 1) * DAY).toISOString())
    ).toBe(false);
  });

  it("is false without a date", () => {
    expect(isRecentlyAdded(undefined)).toBe(false);
  });
});
