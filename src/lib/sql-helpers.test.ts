import { describe, expect, it } from "vitest";
import { countOf } from "@/lib/sql-helpers";

describe("countOf", () => {
  it("reads a count that Postgres returned as text", () => {
    expect(countOf({ count: "12" })).toBe(12);
  });
  it("reads a bigint", () => {
    expect(countOf({ count: BigInt(3) })).toBe(3);
  });
  it("reads a number", () => {
    expect(countOf({ count: 7 })).toBe(7);
  });
});
