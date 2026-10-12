import { describe, expect, it } from "vitest";
import { formatCount } from "@/lib/format-count";

describe("formatCount", () => {
  it("writes counts in full up to 9,999", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(9999)).toBe("9,999");
  });

  it("shortens bigger counts", () => {
    expect(formatCount(10_000)).toBe("10K");
    expect(formatCount(12_940)).toBe("12.9K");
    expect(formatCount(1_250_000)).toBe("1.3M");
  });
});
