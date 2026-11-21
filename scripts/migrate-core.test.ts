import { describe, expect, it } from "vitest";
import { adoptPrismaHistory, pendingMigrations } from "./migrate-core.mjs";

describe("pendingMigrations", () => {
  const a = { version: "20261010162852", name: "accounts" };
  const b = { version: "20261010164909", name: "library" };
  const c = { version: "20261010170921", name: "two_factor" };

  it("returns the files not yet applied, sorted by version", () => {
    expect(pendingMigrations([c, a, b], new Set([a.version]))).toEqual([b, c]);
  });

  it("returns nothing when everything is applied", () => {
    expect(pendingMigrations([a, b], new Set([a.version, b.version]))).toEqual([]);
  });

  it("throws when an applied version's file has a different name", () => {
    const renamed = { version: a.version, name: "accounts_v2" };
    const names = new Map([[a.version, "accounts"]]);
    expect(() => pendingMigrations([renamed], new Set([a.version]), names)).toThrow(
      "Migration 20261010162852 was renamed"
    );
  });
});

describe("adoptPrismaHistory", () => {
  it("maps Prisma folder names to versions", () => {
    expect(adoptPrismaHistory(["20261010162852_accounts"])).toEqual(["20261010162852"]);
  });
});
