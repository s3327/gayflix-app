import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { withRollback } from "@/test/database";

describe("database", () => {
  it("reads timestamp-without-time-zone values as UTC, whatever TZ is", async () => {
    await withRollback(async (trx) => {
      await sql`create temporary table tz_probe (at timestamp without time zone not null) on commit drop`.execute(trx);
      await sql`insert into tz_probe (at) values ('2026-01-01T00:00:00Z')`.execute(trx);
      const { rows } = await sql<{ at: Date }>`select at from tz_probe`.execute(trx);
      expect(rows[0].at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  it("rolls back, and lets other errors through", async () => {
    await expect(
      withRollback(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
