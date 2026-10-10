import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/account/favorite")).toBe("/account/favorite");
    expect(safeNextPath("/list/abc?x=1")).toBe("/list/abc?x=1");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "account",
    ]) {
      expect(safeNextPath(bad)).toBe("/account");
    }
  });
});
