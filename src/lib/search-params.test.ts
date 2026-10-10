import { describe, expect, it } from "vitest";
import { firstParam, pageParam } from "@/lib/search-params";

describe("firstParam", () => {
  it("returns the value, or the first of repeated values", () => {
    expect(firstParam("drama")).toBe("drama");
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("pageParam", () => {
  it("accepts positive integers", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam(["2", "9"])).toBe(2);
  });

  it("falls back to 1 for anything else", () => {
    for (const bad of [undefined, "", "abc", "0", "-2", "1.5", "Infinity"]) {
      expect(pageParam(bad)).toBe(1);
    }
  });
});
