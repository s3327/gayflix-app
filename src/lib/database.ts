import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "@/lib/db-types";
import { postgresConfig } from "@/lib/database-config.mjs";

const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;

/**
 * The Kysely client for new code. Server code only: it holds the database
 * connection string. Same connection as the Prisma client in src/lib/db.ts
 * (DATABASE_URL, TLS from src/lib/database-config.mjs). In development it
 * is kept on globalThis so hot reloads don't open a new pool each time.
 *
 * Columns of type `timestamp` (without time zone) are read as UTC. The
 * parser is set on this pool only, so it doesn't change what Prisma's
 * adapter reads.
 */
function createClient() {
  const pool = new pg.Pool({
    ...postgresConfig(),
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") =>
        oid === TIMESTAMP_WITHOUT_TIME_ZONE
          ? (value: string) => new Date(value + "Z")
          : pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
    },
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

const globalForKysely = globalThis as unknown as { kysely?: Kysely<DB> };

export const database: Kysely<DB> = globalForKysely.kysely ?? createClient();

if (process.env.NODE_ENV !== "production") globalForKysely.kysely = database;
