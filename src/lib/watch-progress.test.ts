import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  isFinished,
  parseProgress,
  progressFraction,
  resumePosition,
  timeLeft,
} from "@/lib/watch-progress";

describe("parseProgress", () => {
  it("keeps whole seconds, and never past the end", () => {
    expect(parseProgress(61.7, 5400.4)).toEqual({ position: 61, duration: 5400 });
    expect(parseProgress(5400.9, 5400.4)).toEqual({ position: 5400, duration: 5400 });
  });

  it("rejects anything that isn't a position in a video of known length", () => {
    expect(parseProgress(10, Infinity)).toBeNull();
    expect(parseProgress(NaN, 100)).toBeNull();
    expect(parseProgress(-1, 100)).toBeNull();
    expect(parseProgress(0, 0)).toBeNull();
    expect(parseProgress(10, 2 * 24 * 60 * 60)).toBeNull();
    expect(parseProgress("10", 100)).toBeNull();
    expect(parseProgress(10, undefined)).toBeNull();
  });
});

describe("isFinished", () => {
  it("counts the end credits as the end", () => {
    // 5% of 90 minutes is 4.5 minutes.
    expect(isFinished({ position: 5400 - 271, duration: 5400 })).toBe(false);
    expect(isFinished({ position: 5400 - 270, duration: 5400 })).toBe(true);
    // At least 30 seconds, however short.
    expect(isFinished({ position: 69, duration: 100 })).toBe(false);
    expect(isFinished({ position: 70, duration: 100 })).toBe(true);
  });

  it("is false without a duration", () => {
    expect(isFinished({ position: 0, duration: 0 })).toBe(false);
  });
});

describe("resumePosition", () => {
  it("picks up where it stopped", () => {
    expect(resumePosition({ position: 754, duration: 5400 })).toBe(754);
  });

  it("starts over near the start, after the end, or without progress", () => {
    expect(resumePosition({ position: 9, duration: 5400 })).toBe(0);
    expect(resumePosition({ position: 5300, duration: 5400 })).toBe(0);
    expect(resumePosition({ position: 0, duration: 0 })).toBe(0);
  });
});

describe("progressFraction", () => {
  it("is the part watched", () => {
    expect(progressFraction({ position: 1350, duration: 5400 })).toBe(0.25);
    expect(progressFraction({ position: 0, duration: 0 })).toBe(0);
  });
});

describe("timeLeft", () => {
  it("rounds up to the minute and shows hours past one", () => {
    expect(timeLeft({ position: 0, duration: 750 })).toBe("13 min left");
    expect(timeLeft({ position: 99, duration: 100 })).toBe("1 min left");
    expect(timeLeft({ position: 0, duration: 3600 })).toBe("1h left");
    expect(timeLeft({ position: 600, duration: 5400 })).toBe("1h 20m left");
  });
});

describe("formatTimestamp", () => {
  it("shows minutes and seconds, and hours from an hour", () => {
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(754.9)).toBe("12:34");
    expect(formatTimestamp(3729)).toBe("1:02:09");
  });
});
