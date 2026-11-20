// Applies the SQL files in supabase/migrations that haven't run yet.
//
//   npm run db:deploy
//
// Connects with DIRECT_URL (falling back to DATABASE_URL), from the
// environment or .env / .env.local. Applied versions are recorded in
// supabase_migrations.schema_migrations, the same ledger the Supabase CLI
// uses. On a database that Prisma Migrate managed, the first run adopts
// _prisma_migrations: those migrations are recorded without being re-run.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";
import pg from "pg";
import { postgresConfig } from "../src/lib/database-config.mjs";
import { adoptPrismaHistory, parseMigrationFile, pendingMigrations } from "./migrate-core.mjs";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL is not set.");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .map((fileName) => {
    const parsed = parseMigrationFile(fileName);
    return parsed && { ...parsed, fileName };
  })
  .filter(Boolean);

const client = new pg.Client(postgresConfig(url));
await client.connect();
try {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY, statements text[], name text
    )`);

  const ledger = () => client.query("SELECT version, name FROM supabase_migrations.schema_migrations");
  let { rows } = await ledger();

  if (rows.length === 0) {
    const prisma = await client.query("SELECT to_regclass('public._prisma_migrations') AS t");
    if (prisma.rows[0].t) {
      const finished = await client.query(
        "SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
      );
      const versions = new Set(adoptPrismaHistory(finished.rows.map((row) => row.migration_name)));
      const adopted = files.filter((file) => versions.has(file.version));
      for (const file of adopted) {
        await client.query(
          "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING",
          [file.version, file.name, [readFileSync(join(dir, file.fileName), "utf8")]]
        );
      }
      if (adopted.length) console.log(`Adopted ${adopted.length} migrations from _prisma_migrations.`);
      ({ rows } = await ledger());
    }
  }

  const applied = new Set(rows.map((row) => row.version));
  const appliedNames = new Map(rows.map((row) => [row.version, row.name]));
  const pending = pendingMigrations(files, applied, appliedNames);

  if (pending.length === 0) {
    console.log("No pending migrations.");
  }
  for (const file of pending) {
    const sql = readFileSync(join(dir, file.fileName), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)",
        [file.version, file.name, [sql]]
      );
      await client.query("COMMIT");
      console.log(`Applied ${file.fileName}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`Migration ${file.fileName} failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
      break;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
