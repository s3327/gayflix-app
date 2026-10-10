import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The one Prisma client for the app. Server code only: it holds the
 * database connection string.
 *
 * Connects through the node-postgres driver adapter, which works with
 * Prisma Postgres (its direct `postgres://` connection string) and with
 * any local Postgres. In development the client is kept on globalThis so
 * hot reloads don't open a new connection pool each time.
 */
function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
