import { z } from "zod";
import { SeededRng } from "./prng";

/**
 * Curated illustrative profile that shapes a company's deterministic mock
 * data. Values approximate each company's real-world character (a megacap
 * staple looks calm, a crypto exchange looks wild) but are NOT real
 * financials — everything generated from them is badged `source: "mock"`.
 */
export const MockProfileSchema = z.object({
  /** Price at series start (SERIES_START or ipoDate). */
  startPrice: z.number().positive(),
  /** Expected annual price drift, decimal. */
  drift: z.number(),
  /** Annualized price volatility, decimal. */
  vol: z.number().positive(),
  /** ISO day the mock price/fundamentals history begins (default 2020-01-06). */
  ipoDate: z.string().optional(),

  /** Annual revenue at series start, USD. */
  baseRevenue: z.number().positive(),
  /** Annual revenue growth rate, decimal. */
  revenueGrowth: z.number(),
  /** Null for banks/asset managers where gross margin is not meaningful. */
  grossMargin: z.number().nullable(),
  operatingMargin: z.number(),
  /** Annual drift applied to operating margin (margin expansion/compression). */
  marginTrend: z.number().default(0),
  taxRate: z.number().default(0.21),
  /** Shares outstanding (constant — buybacks not modeled; documented). */
  sharesOut: z.number().positive(),
  /** Equity as a fraction of annual revenue; negative models negative equity. */
  equityPctRevenue: z.number(),
  /** Total debt as a multiple of |equity|. */
  debtToEquity: z.number().min(0),
  /** Cash as a fraction of annual revenue. */
  cashPctRevenue: z.number().min(0).default(0.15),
  /** Fraction of net income paid out as dividends (0 = no dividend). */
  dividendPayout: z.number().min(0).max(1.2).default(0),
  capexPctRevenue: z.number().min(0),
  /** Quarter-to-quarter noise scale for fundamentals (0.05 calm, 0.4 wild). */
  fundamentalsNoise: z.number().min(0).default(0.08),
});

export type MockProfile = z.infer<typeof MockProfileSchema>;

/**
 * Fallback profile for tickers without a curated one (e.g. CSV-imported
 * companies): plausible mid-cap derived deterministically from the ticker.
 */
export function defaultProfileFor(ticker: string): MockProfile {
  const rng = new SeededRng(`${ticker}:default-profile`);
  return MockProfileSchema.parse({
    startPrice: Math.round(rng.range(20, 300)),
    drift: rng.range(0.0, 0.15),
    vol: rng.range(0.2, 0.45),
    baseRevenue: rng.range(2e9, 50e9),
    revenueGrowth: rng.range(0.0, 0.15),
    grossMargin: rng.range(0.3, 0.6),
    operatingMargin: rng.range(0.08, 0.25),
    marginTrend: rng.range(-0.005, 0.01),
    sharesOut: rng.range(0.2e9, 3e9),
    equityPctRevenue: rng.range(0.3, 1.0),
    debtToEquity: rng.range(0.1, 1.5),
    capexPctRevenue: rng.range(0.02, 0.12),
    fundamentalsNoise: rng.range(0.05, 0.2),
    dividendPayout: rng.next() < 0.4 ? rng.range(0.1, 0.5) : 0,
  });
}
