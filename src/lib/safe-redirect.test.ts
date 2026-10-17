import { describe, expect, it } from "vitest";
import { authHref, nextParam, safeAdminNextPath, safeNextPath } from "@/lib/safe-redirect";

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

describe("safeAdminNextPath", () => {
  it("keeps valid admin paths", () => {
    expect(safeAdminNextPath("/admin/library/movies/123")).toBe("/admin/library/movies/123");
    expect(safeAdminNextPath("/admin/reports?status=resolved")).toBe("/admin/reports?status=resolved");
  });

  it("rejects non-admin paths, login paths, and open redirects", () => {
    for (const bad of [
      null,
      "",
      "/home",
      "/account",
      "/admin/login",
      "/admin/login?next=/admin/dashboard",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
    ]) {
      expect(safeAdminNextPath(bad)).toBe("/admin/dashboard");
    }
  });
});

describe("authHref", () => {
  it("carries the page to come back to", () => {
    expect(authHref("/login", "/watch/chosen-family")).toBe("/login?next=%2Fwatch%2Fchosen-family");
    expect(authHref("/signup", "/genre?genre=Drama")).toBe("/signup?next=%2Fgenre%3Fgenre%3DDrama");
  });

  it("leaves it off when there's none", () => {
    expect(authHref("/login")).toBe("/login");
    expect(authHref("/signup", null)).toBe("/signup");
  });
});

describe("nextParam", () => {
  it("keeps a path on this site", () => {
    expect(nextParam("/series/the-brownstone")).toBe("/series/the-brownstone");
  });

  it("drops anything else", () => {
    for (const bad of [undefined, "", "https://evil.example", "//evil.example", ["/a", "/b"]]) {
      expect(nextParam(bad)).toBeNull();
    }
  });
});
