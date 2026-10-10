import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Load .env / .env.local the same way `next dev` and `next build` do, so
// the Prisma CLI and the app always read the same DATABASE_URL.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Optional for `prisma generate` (CI builds without a database);
    // required for `migrate` commands.
    url: process.env.DATABASE_URL,
  },
});
