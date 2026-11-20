import { sql, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import type { DB } from "@/lib/db-types";
import { withRollback } from "@/test/database";

const PAST = "2000-01-01T00:00:00";

/** A media row whose updatedAt is far in the past. */
async function insertProbe(trx: Transaction<DB>) {
  await sql`set local time zone 'Asia/Bangkok'`.execute(trx);
  await sql`
    insert into media (id, type, title, year, duration, genres, country, language, "posterUrl", featured, "updatedAt")
    values ('db-defaults-probe', 'movie', 'Before', 2020, '1h', '{}', 'US', 'en', '/p.jpg', true, ${PAST})
  `.execute(trx);
}

async function updatedAt(trx: Transaction<DB>): Promise<Date> {
  const row = await trx
    .selectFrom("media")
    .select("updatedAt")
    .where("id", "=", "db-defaults-probe")
    .executeTakeFirstOrThrow();
  return row.updatedAt;
}

describe("database-side defaults", () => {
  it("gives a row inserted without an id 32 lowercase hex characters", async () => {
    await withRollback(async (trx) => {
      const row = await trx
        .insertInto("activity_log")
        .values({ actorEmail: "a@example.com", action: "test", entityType: "test", summary: "test" })
        .returning("id")
        .executeTakeFirstOrThrow();
      expect(row.id).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  it("sets updatedAt to now in UTC when a field changes, whatever the session time zone", async () => {
    await withRollback(async (trx) => {
      await insertProbe(trx);
      await sql`update media set title = 'After' where id = 'db-defaults-probe'`.execute(trx);
      const { rows } = await sql<{ fresh: boolean }>`
        select abs(extract(epoch from ("updatedAt" - (now() at time zone 'UTC')))) < 60 as fresh
        from media where id = 'db-defaults-probe'`.execute(trx);
      expect(rows[0].fresh).toBe(true);
      expect((await updatedAt(trx)).getUTCFullYear()).toBeGreaterThan(2000);
    });
  });

  it("defaults updatedAt to now in UTC on insert, whatever the session time zone", async () => {
    await withRollback(async (trx) => {
      await sql`set local time zone 'Asia/Bangkok'`.execute(trx);
      await sql`insert into collection (id, title) values ('db-defaults-collection', 'Probe')`.execute(trx);
      const { rows } = await sql<{ fresh: boolean }>`
        select abs(extract(epoch from ("updatedAt" - (now() at time zone 'UTC')))) < 60 as fresh
        from collection where id = 'db-defaults-collection'`.execute(trx);
      expect(rows[0].fresh).toBe(true);
    });
  });

  it("leaves updatedAt alone when only viewCount changes", async () => {
    await withRollback(async (trx) => {
      await insertProbe(trx);
      await sql`update media set "viewCount" = "viewCount" + 1 where id = 'db-defaults-probe'`.execute(trx);
      expect((await updatedAt(trx)).toISOString()).toBe("2000-01-01T00:00:00.000Z");
    });
  });

  it("leaves updatedAt alone when only featured changes", async () => {
    await withRollback(async (trx) => {
      await insertProbe(trx);
      await sql`update media set featured = false where id = 'db-defaults-probe'`.execute(trx);
      expect((await updatedAt(trx)).toISOString()).toBe("2000-01-01T00:00:00.000Z");
    });
  });

  it("keeps an updatedAt the statement sets itself", async () => {
    await withRollback(async (trx) => {
      await insertProbe(trx);
      await sql`update media set title = 'After', "updatedAt" = '2010-05-05T05:05:05' where id = 'db-defaults-probe'`.execute(trx);
      expect((await updatedAt(trx)).toISOString()).toBe("2010-05-05T05:05:05.000Z");
    });
  });
});
