import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/config/env";

/**
 * Prisma client singleton. The global stash survives Next.js dev-server hot
 * reloads so we do not leak connections. Integration tests construct their
 * own isolated clients via createPrismaClient(url) instead.
 */
const globalForPrisma = globalThis as unknown as { prismaSingleton?: PrismaClient };

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  const url = databaseUrl ?? getEnv().DATABASE_URL;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.prismaSingleton ?? createPrismaClient();

if (getEnv().NODE_ENV !== "production") {
  globalForPrisma.prismaSingleton = prisma;
}
