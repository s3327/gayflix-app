import { describe, expect, it } from "vitest";
import { MAX_REPORT_DETAILS, parseReport, startOfUtcDay } from "@/lib/reports";

const report = { mediaId: "chosen-family", reason: "Video won't play", details: "  Stops at 3:12  " };

describe("parseReport", () => {
  it("accepts a known reason and trims the details", () => {
    expect(parseReport(report)).toEqual({ ...report, details: "Stops at 3:12" });
  });

  it("stores empty details as null", () => {
    expect(parseReport({ ...report, details: "   " })?.details).toBeNull();
    expect(parseReport({ mediaId: "chosen-family", reason: "Other" })?.details).toBeNull();
  });

  it("rejects unknown reasons, bad ids and long details", () => {
    for (const bad of [
      null,
      { ...report, reason: "Spam" },
      { ...report, mediaId: "" },
      { ...report, mediaId: "a/b" },
      { ...report, details: 42 },
      { ...report, details: "x".repeat(MAX_REPORT_DETAILS + 1) },
    ]) {
      expect(parseReport(bad)).toBeNull();
    }
  });
});

describe("startOfUtcDay", () => {
  it("returns midnight UTC of the same UTC day", () => {
    expect(startOfUtcDay(new Date("2026-10-10T23:59:59Z")).toISOString()).toBe(
      "2026-10-10T00:00:00.000Z"
    );
    expect(startOfUtcDay(new Date("2026-10-11T00:00:00Z")).toISOString()).toBe(
      "2026-10-11T00:00:00.000Z"
    );
  });
});
