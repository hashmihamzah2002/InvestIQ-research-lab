import Papa from "papaparse";
import { z } from "zod";

/**
 * CSV row schemas + tolerant parser. Shared by the file-based CSV provider
 * (data/imports/*.csv) and the admin upload endpoint. Every row is validated
 * independently: valid rows import, invalid rows come back as line-numbered
 * errors — one bad line never poisons a whole file.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

const numOrNull = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
  z.number().finite().nullable(),
);

const requiredNum = z.preprocess((v) => Number(v), z.number().finite());

const ticker = z
  .string()
  .min(1)
  .transform((s) => s.trim().toUpperCase());

export const PriceRowSchema = z.object({
  ticker,
  date: isoDate,
  open: requiredNum,
  high: requiredNum,
  low: requiredNum,
  close: requiredNum,
  adjClose: numOrNull,
  volume: numOrNull,
});
export type PriceRow = z.infer<typeof PriceRowSchema>;

export const FundamentalsRowSchema = z.object({
  ticker,
  periodEnd: isoDate,
  periodType: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.enum(["ANNUAL", "QUARTERLY"])),
  revenue: numOrNull,
  grossProfit: numOrNull,
  operatingIncome: numOrNull,
  netIncome: numOrNull,
  eps: numOrNull,
  sharesOut: numOrNull,
  totalAssets: numOrNull,
  totalLiabilities: numOrNull,
  totalEquity: numOrNull,
  cash: numOrNull,
  totalDebt: numOrNull,
  currentAssets: numOrNull,
  currentLiabilities: numOrNull,
  ebitda: numOrNull,
  operatingCashFlow: numOrNull,
  capex: numOrNull,
  dividendsPaid: numOrNull,
  interestExpense: numOrNull,
  reportedAt: z
    .union([isoDate, z.literal(""), z.undefined()])
    .transform((v) => (v instanceof Date ? v : null)),
});
export type FundamentalsRow = z.infer<typeof FundamentalsRowSchema>;

export const FilingRowSchema = z.object({
  ticker,
  accessionNo: z.string().min(3),
  form: z.string().min(1),
  filedAt: isoDate,
  title: z.string().optional(),
  url: z.string().min(5),
  /** Pipe-separated flag codes, e.g. "LATE_FILING|ITEM_4_02". */
  flags: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "")
        .split("|")
        .map((f) => f.trim())
        .filter(Boolean),
    ),
});
export type FilingRow = z.infer<typeof FilingRowSchema>;

export const NewsRowSchema = z.object({
  ticker,
  publishedAt: isoDate,
  title: z.string().min(1),
  url: z.string().min(5),
  source: z.string().optional(),
  summary: z.string().optional(),
  sentiment: numOrNull.pipe(z.number().min(-1).max(1).nullable()),
});
export type NewsRow = z.infer<typeof NewsRowSchema>;

export const MacroRowSchema = z.object({
  seriesId: z
    .string()
    .min(1)
    .transform((s) => s.trim().toUpperCase()),
  date: isoDate,
  value: requiredNum,
});
export type MacroRow = z.infer<typeof MacroRowSchema>;

export interface CsvParseResult<T> {
  rows: T[];
  errors: { line: number; message: string }[];
}

/** Parse CSV text with per-row validation. Line numbers are 1-based file lines. */
export function parseCsv<T>(text: string, schema: z.ZodType<T>): CsvParseResult<T> {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const rows: T[] = [];
  const errors: { line: number; message: string }[] = [];

  for (const papaError of parsed.errors) {
    errors.push({
      line: (papaError.row ?? 0) + 2,
      message: papaError.message,
    });
  }

  parsed.data.forEach((raw, idx) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      rows.push(result.data);
    } else {
      const issue = result.error.issues[0];
      errors.push({
        line: idx + 2, // +1 header, +1 one-based
        message: `${issue?.path.join(".") || "row"}: ${issue?.message ?? "invalid"}`,
      });
    }
  });

  return { rows, errors };
}
