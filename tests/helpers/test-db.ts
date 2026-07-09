import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/client";

export interface TestDb {
  db: PrismaClient;
  url: string;
  cleanup: () => Promise<void>;
}

/**
 * Scratch SQLite database with all Prisma migrations applied (by executing
 * the committed migration SQL directly — fast, no prisma CLI involved).
 * Never touches dev.db.
 */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), "investiq-test-"));
  const file = join(dir, "test.db");

  const sqlite = new BetterSqlite3(file);
  const migrationsRoot = join(process.cwd(), "prisma", "migrations");
  const entries = readdirSync(migrationsRoot)
    .filter((name) => {
      const full = join(migrationsRoot, name);
      return statSync(full).isDirectory();
    })
    .sort();
  for (const entry of entries) {
    const sql = readFileSync(join(migrationsRoot, entry, "migration.sql"), "utf8");
    sqlite.exec(sql);
  }
  sqlite.close();

  const url = `file:${file.replace(/\\/g, "/")}`;
  const db = createPrismaClient(url);

  return {
    db,
    url,
    cleanup: async () => {
      await db.$disconnect();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows can keep the file handle alive briefly; temp dir cleanup
        // failure is harmless.
      }
    },
  };
}
