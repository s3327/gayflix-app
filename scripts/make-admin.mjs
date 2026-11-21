// Gives an existing account the "admin" role, or takes it away.
//
//   npm run make-admin -- someone@example.com
//   npm run make-admin -- someone@example.com --revoke
//
// The account must already exist (sign up at /signup first). Reads
// DATABASE_URL from the environment or .env / .env.local.
import nextEnv from "@next/env";
import pg from "pg";
import { postgresConfig } from "../src/lib/database-config.mjs";

nextEnv.loadEnvConfig(process.cwd());

const [email, flag] = process.argv.slice(2);
if (!email || (flag && flag !== "--revoke")) {
  console.error("Usage: npm run make-admin -- <email> [--revoke]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const role = flag === "--revoke" ? "user" : "admin";
const client = new pg.Client(postgresConfig());
await client.connect();
try {
  // The role lives in public.profile (one row per Supabase Auth account).
  const result = await client.query(
    `UPDATE public.profile p SET role = $1
       FROM auth.users u
      WHERE u.id = p.id AND lower(u.email) = lower($2)
      RETURNING u.email, u.email_confirmed_at IS NOT NULL AS "emailVerified"`,
    [role, email]
  );
  if (result.rowCount === 0) {
    console.error(`No account found for ${email}. Sign up at /signup first.`);
    process.exitCode = 1;
  } else {
    const [user] = result.rows;
    console.log(`${user.email} is now ${role === "admin" ? "an admin" : "a regular user"}.`);
    if (!user.emailVerified) console.log("Note: this email isn't verified yet, so it can't log in until it is.");
    // Existing sessions keep working; admin access reads the role from
    // the database, so the change applies to it at once (elsewhere at
    // the account's next token refresh, within the hour).
  }
} finally {
  await client.end();
}
