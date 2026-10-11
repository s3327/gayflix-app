import { describe, expect, it } from "vitest";
import { TRENDING_DAYS, trendingSince, utcDay, viewerKey } from "@/lib/views";

describe("utcDay", () => {
  it("is the UTC calendar day", () => {
    expect(utcDay(new Date("2026-10-11T23:59:59Z"))).toBe("2026-10-11");
    expect(utcDay(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-12");
    // 23:30 on the 11th in New York is already the 12th in UTC.
    expect(utcDay(new Date("2026-10-11T23:30:00-04:00"))).toBe("2026-10-12");
  });
});

describe("trendingSince", () => {
  it("covers the last seven days, today included", () => {
    expect(TRENDING_DAYS).toBe(7);
    expect(trendingSince(new Date("2026-10-11T12:00:00Z"))).toBe("2026-10-05");
  });

  it("crosses month and year boundaries", () => {
    expect(trendingSince(new Date("2026-10-03T00:00:00Z"))).toBe("2026-09-27");
    expect(trendingSince(new Date("2027-01-02T23:59:59Z"))).toBe("2026-12-27");
  });

  it("doesn't change the date it's given", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    trendingSince(now);
    expect(now.toISOString()).toBe("2026-10-11T12:00:00.000Z");
  });
});

describe("viewerKey", () => {
  it("tells accounts and IP addresses apart, per day", () => {
    const keys = [
      viewerKey("2026-10-11", { userId: "abc" }),
      viewerKey("2026-10-11", { ip: "abc" }),
      viewerKey("2026-10-12", { userId: "abc" }),
    ];
    expect(new Set(keys).size).toBe(3);
    expect(viewerKey("2026-10-11", { ip: "203.0.113.7" })).toBe(
      viewerKey("2026-10-11", { ip: "203.0.113.7" })
    );
  });
});
