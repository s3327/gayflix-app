import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Load .env / .env.local the same way `next dev` and `next build` do, so
// the Prisma CLI and the app always read the same settings.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a session connection: on Supabase, DIRECT_URL is
    // the session pooler (port 5432), because the transaction pooler the
    // app uses (DATABASE_URL, port 6543) can't run them. Locally, where
    // there's no pooler, DATABASE_URL does for both.
    // Optional for `prisma generate` (CI builds without a database);
    // required for `migrate` commands.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
