import type { Env } from "@/lib/config/env";
import type { Logger } from "@/lib/logging/logger";
import type { ProviderCategory } from "@/lib/db/json";

/**
 * Provider abstraction. Each data category has an interface; adapters
 * (sec-edgar, fred, alpha-vantage, finnhub, fmp, csv, mock) implement one or
 * more. The registry (registry.ts) resolves an ordered fallback chain per
 * category from env config. DTOs below are the ONLY shapes that cross from
 * adapters into the rest of the app — raw API payloads must be Zod-validated
 * and mapped inside the adapter.
 */

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface DateRange {
  /** Inclusive UTC day. */
  from: Date;
  /** Inclusive UTC day. */
  to: Date;
}

export interface PriceBarDTO {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export interface CompanyProfileDTO {
  ticker: string;
  name?: string;
  description?: string;
  website?: string;
  sector?: string;
  industry?: string;
}

export interface StatementPeriodDTO {
  periodEnd: Date;
  periodType: "ANNUAL" | "QUARTERLY";
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  eps?: number | null;
  sharesOut?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  totalEquity?: number | null;
  cash?: number | null;
  totalDebt?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  ebitda?: number | null;
  operatingCashFlow?: number | null;
  capex?: number | null;
  dividendsPaid?: number | null;
  interestExpense?: number | null;
  /** First public availability; consumers add a reporting lag when absent. */
  reportedAt?: Date | null;
}

/** Forward-looking metrics — only some providers supply these. */
export interface KeyMetricsDTO {
  forwardPe?: number | null;
  /** Estimated next-12-month revenue growth, decimal (0.12 = 12%). */
  forwardGrowth?: number | null;
  /** Earnings revision trend, -1 (cuts) .. +1 (raises). */
  epsRevisionTrend?: number | null;
  dividendYield?: number | null;
}

export interface FilingDTO {
  accessionNo: string;
  form: string;
  filedAt: Date;
  title?: string;
  url: string;
  /** Red flags detected at ingest (see FILING_FLAGS). */
  flags: string[];
}

/** Known red-flag codes attachable to filings. */
export const FILING_FLAGS = {
  NON_RELIANCE: "ITEM_4_02", // 8-K Item 4.02 non-reliance on prior financials
  LATE_FILING: "LATE_FILING", // NT 10-K / NT 10-Q
  AUDITOR_CHANGE: "AUDITOR_CHANGE", // 8-K Item 4.01
} as const;

export interface NewsItemDTO {
  publishedAt: Date;
  title: string;
  url: string;
  source?: string;
  summary?: string;
  /** -1..1; null when the provider has no sentiment. */
  sentiment?: number | null;
}

export interface MacroObservationDTO {
  date: Date;
  value: number;
}

// ---------------------------------------------------------------------------
// Provider interfaces
// ---------------------------------------------------------------------------

/** Identity a provider needs about a company to fetch data for it. */
export interface CompanyRef {
  ticker: string;
  /** SEC CIK (zero-padded 10 digits) when known. */
  cik?: string | null;
  /** ISO country of incorporation/listing context (US, CA, ...). */
  country?: string;
  sector?: string;
  /** Serialized MockProfile (mock adapter only). */
  mockProfileJson?: string | null;
  /** True for index proxies (SPY). */
  isIndex?: boolean;
}

export interface ProviderContext {
  env: Env;
  log: Logger;
  /** Reference date for generators/incremental fetches; defaults to today. */
  asOf: Date;
}

export interface ProviderBase {
  readonly name: string;
  readonly categories: readonly ProviderCategory[];
  /** False = skipped in chains (e.g. missing API key). Mock is always true. */
  isConfigured(env: Env): boolean;
}

export interface MarketDataProvider extends ProviderBase {
  getDailyPrices(
    company: CompanyRef,
    range: DateRange,
    ctx: ProviderContext,
  ): Promise<PriceBarDTO[]>;
}

export interface FundamentalsProvider extends ProviderBase {
  getStatements(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<StatementPeriodDTO[]>;
  getCompanyProfile?(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<CompanyProfileDTO>;
  getKeyMetrics?(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<KeyMetricsDTO>;
}

export interface FilingsProvider extends ProviderBase {
  getRecentFilings(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<FilingDTO[]>;
}

export interface NewsProvider extends ProviderBase {
  getCompanyNews(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<NewsItemDTO[]>;
}

export interface MacroProvider extends ProviderBase {
  /** seriesId is OUR canonical id (e.g. CPI_YOY); adapters map internally. */
  getSeries(
    seriesId: string,
    since: Date,
    ctx: ProviderContext,
  ): Promise<MacroObservationDTO[]>;
}

/** Error adapters throw for clean "try the next provider" semantics. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly category: ProviderCategory,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
