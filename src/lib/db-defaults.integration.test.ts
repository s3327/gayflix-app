import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { withRollback } from "@/test/database";

describe("database-side defaults", () => {
  it("gives a row inserted without an id a 36-character id", async () => {
    await withRollback(async (trx) => {
      const row = await trx
        .insertInto("activity_log")
        .values({ actorEmail: "a@example.com", action: "test", entityType: "test", summary: "test" })
        .returning("id")
        .executeTakeFirstOrThrow();
      expect(row.id).toHaveLength(36);
    });
  });

  it("sets updatedAt on update, in UTC whatever the session time zone", async () => {
    await withRollback(async (trx) => {
      await sql`set local time zone 'Asia/Bangkok'`.execute(trx);
      await sql`
        insert into media (id, type, title, year, duration, genres, country, language, "posterUrl", "updatedAt")
        values ('db-defaults-probe', 'movie', 'Before', 2020, '1h', '{}', 'US', 'en', '/p.jpg', '2000-01-01')
      `.execute(trx);
      await trx.updateTable("media").set({ title: "After" }).where("id", "=", "db-defaults-probe").execute();
      const row = await trx
        .selectFrom("media")
        .select(["updatedAt", sql<boolean>`"updatedAt" > (now() at time zone 'UTC') - interval '1 minute'`.as("fresh")])
        .where("id", "=", "db-defaults-probe")
        .executeTakeFirstOrThrow();
      expect(row.updatedAt.getUTCFullYear()).toBeGreaterThan(2000);
      expect(row.fresh).toBe(true);
    });
  });
});
