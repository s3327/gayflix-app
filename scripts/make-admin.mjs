// Gives an existing account the "admin" role, or takes it away.
//
//   npm run make-admin -- someone@example.com
//   npm run make-admin -- someone@example.com --revoke
//
// The account must already exist (sign up at /signup first). Reads
// DATABASE_URL from the environment or .env / .env.local.
import nextEnv from "@next/env";
import pg from "pg";

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
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(
    `UPDATE "user" SET role = $1, "updatedAt" = now() WHERE lower(email) = lower($2) RETURNING email, "emailVerified"`,
    [role, email]
  );
  if (result.rowCount === 0) {
    console.error(`No account found for ${email}. Sign up at /signup first.`);
    process.exitCode = 1;
  } else {
    const [user] = result.rows;
    console.log(`${user.email} is now ${role === "admin" ? "an admin" : "a regular user"}.`);
    if (!user.emailVerified) console.log("Note: this email isn't verified yet, so it can't log in until it is.");
    // Existing sessions keep working; the role is read fresh on every
    // admin request, so the change applies immediately.
  }
} finally {
  await client.end();
}
