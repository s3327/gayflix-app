// Gives every Better Auth account a Supabase Auth account, before the
// migration 20261125000001_user_ids_to_supabase.sql moves the site's data
// over to the new ids (docs/SUPABASE_CUTOVER.md, step 4).
//
//   node scripts/move-accounts-to-supabase.mjs --dry-run   # print the plan
//   node scripts/move-accounts-to-supabase.mjs
//
// Needs, in the environment (no .env file is read, so it can't run against
// the wrong project by accident):
//   DIRECT_URL                the database (session pooler on Supabase),
//                             plus DATABASE_CA_CERT for a Supabase host
//   NEXT_PUBLIC_SUPABASE_URL  the project's API URL
//   SUPABASE_SECRET_KEY       its secret key
//
// It can run again: accounts already moved are skipped. Passwords don't
// carry over; everyone sets a new one with "Forgot password". Logs show
// emails masked.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { postgresConfig } from "../src/lib/database-config.mjs";
import { moveAccounts } from "./move-accounts-core.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
if (args.some((arg) => arg !== "--dry-run")) {
  console.error("Usage: node scripts/move-accounts-to-supabase.mjs [--dry-run]");
  process.exit(1);
}

const missing = ["DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
  (name) => !process.env[name]?.trim()
);
if (missing.length) {
  console.error(`Not set: ${missing.join(", ")}. Nothing was changed.`);
  process.exit(1);
}

const databaseHost = new URL(process.env.DIRECT_URL).hostname;
const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
console.log(`${dryRun ? "Dry run: " : ""}database ${databaseHost}, Auth ${new URL(authUrl).host}`);

const client = new pg.Client(postgresConfig(process.env.DIRECT_URL));
const supabase = createClient(authUrl, process.env.SUPABASE_SECRET_KEY.trim(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

await client.connect();
try {
  const result = await moveAccounts({ db: client, admin: supabase.auth.admin, dryRun });
  console.log(
    dryRun
      ? `Would move ${result.planned}; ${result.skipped} already moved.`
      : `Moved ${result.moved} (${result.adopted} found from an earlier run); ${result.skipped} already moved.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error("Stopped. Accounts moved so far are recorded; run it again to continue.");
  process.exitCode = 1;
} finally {
  await client.end();
}
