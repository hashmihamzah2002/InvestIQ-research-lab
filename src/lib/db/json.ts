import { z } from "zod";
import { log } from "@/lib/logging/logger";

/**
 * SQLite portability: the schema uses String columns for JSON payloads and
 * uppercase string unions instead of enums. These helpers are the only
 * sanctioned way to read/write those columns.
 */

// --- Shared string unions (DB "enums") ---
export const PeriodTypeSchema = z.enum(["ANNUAL", "QUARTERLY"]);
export type PeriodType = z.infer<typeof PeriodTypeSchema>;

export const RatingSchema = z.enum([
  "STRONG_CANDIDATE",
  "CANDIDATE",
  "WATCHLIST",
  "AVOID",
]);
export type Rating = z.infer<typeof RatingSchema>;

export const RunStatusSchema = z.enum(["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunTriggerSchema = z.enum(["CRON", "MANUAL", "SEED", "API"]);
export type RunTrigger = z.infer<typeof RunTriggerSchema>;

export const ProviderCategorySchema = z.enum([
  "market-data",
  "fundamentals",
  "filings",
  "news",
  "macro",
]);
export type ProviderCategory = z.infer<typeof ProviderCategorySchema>;

// --- JSON column helpers ---

/**
 * Parse a JSON string column. Returns `fallback` (and logs a warning) when
 * the column is empty, malformed, or fails schema validation — read paths
 * must not crash pages over one bad row.
 */
export function parseJsonColumn<T>(
  schema: z.ZodType<T>,
  raw: string | null | undefined,
  fallback: T,
  context?: string,
): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  try {
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    log.warn("db.json_column.invalid", {
      context: context ?? "unknown",
      err: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

/**
 * Strict variant for payloads that must be intact (e.g. score breakdowns
 * inside the scoring pipeline). Throws on malformed data.
 */
export function parseJsonColumnStrict<T>(
  schema: z.ZodType<T>,
  raw: string,
  context?: string,
): T {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    throw new Error(
      `Invalid JSON column${context ? ` (${context})` : ""}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function toJsonColumn(value: unknown): string {
  return JSON.stringify(value);
}
