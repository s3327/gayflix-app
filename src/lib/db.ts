import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { postgresConfig } from "@/lib/database-config.mjs";

/**
 * The one Prisma client for the app. Server code only: it holds the
 * database connection string.
 *
 * Connects through the node-postgres driver adapter with DATABASE_URL:
 * in production, Supabase's transaction pooler (port 6543), which suits
 * serverless functions; locally, any Postgres. TLS for Supabase is set
 * up in src/lib/database-config.mjs. Migrations use the direct
 * connection instead (DIRECT_URL, see prisma.config.ts). In development
 * the client is kept on globalThis so hot reloads don't open a new
 * connection pool each time.
 */
function createClient() {
  return new PrismaClient({ adapter: new PrismaPg(postgresConfig()) });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
