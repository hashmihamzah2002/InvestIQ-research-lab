import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { log } from "@/lib/logging/logger";

/**
 * DB-backed cache for external API responses (ApiCache table). Keys are
 * hashes of provider+URL so secrets in query strings never persist verbatim.
 * This is the ONLY database surface adapters may touch.
 */
export function cacheKeyFor(provider: string, url: string): string {
  return createHash("sha256").update(`${provider}:${url}`).digest("hex");
}

export async function getCachedPayload(
  db: PrismaClient,
  key: string,
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const row = await db.apiCache.findUnique({ where: { key } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= now.getTime()) return null;
    return row.payload;
  } catch (err) {
    // Cache trouble must never break a fetch.
    log.warn("cache.read_failed", { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function setCachedPayload(
  db: PrismaClient,
  key: string,
  payload: string,
  ttlMs: number,
  now: Date = new Date(),
): Promise<void> {
  try {
    const expiresAt = new Date(now.getTime() + ttlMs);
    await db.apiCache.upsert({
      where: { key },
      create: { key, payload, fetchedAt: now, expiresAt },
      update: { payload, fetchedAt: now, expiresAt },
    });
  } catch (err) {
    log.warn("cache.write_failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

/** Remove expired entries (called opportunistically by the pipeline). */
export async function pruneExpiredCache(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.apiCache.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return result.count;
}

/** Standard TTLs per data category. */
export const CACHE_TTL_MS = {
  prices: 12 * 3600_000,
  fundamentals: 24 * 3600_000,
  filings: 6 * 3600_000,
  news: 1 * 3600_000,
  macro: 24 * 3600_000,
} as const;
