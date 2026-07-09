/**
 * Pure metrics layer: plain typed inputs -> derived financial metrics.
 * NO Prisma, NO fetch, NO Next imports (load-bearing architecture rule).
 * The pipeline maps DB rows into these shapes; tests build them by hand.
 */

export interface StatementRow {
  periodEnd: Date;
  periodType: "ANNUAL" | "QUARTERLY";
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  sharesOut: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cash: number | null;
  totalDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  ebitda: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  dividendsPaid: number | null;
  interestExpense: number | null;
  /** First public availability; when null a 45-day lag after periodEnd is assumed. */
  reportedAt: Date | null;
  source: string;
}

export interface PricePoint {
  date: Date;
  close: number;
}

export interface KeyMetricsInput {
  forwardPe: number | null;
  forwardGrowth: number | null;
  epsRevisionTrend: number | null;
  dividendYield: number | null;
  source: string;
}

export interface MetricsInput {
  asOf: Date;
  /** Ascending by date. */
  prices: PricePoint[];
  /** Index proxy (SPY), ascending by date; may be empty. */
  indexPrices: PricePoint[];
  /** Mixed ANNUAL/QUARTERLY rows, any order. */
  statements: StatementRow[];
  keyMetrics?: KeyMetricsInput | null;
  /** Mean news sentiment over the trailing 90 days, -1..1. */
  newsSentiment90d?: number | null;
  priceSource?: string;
}

/** Provenance summary rendered by the UI ("source + asOf" requirement). */
export interface DataQuality {
  prices: { source: string; asOf: string; bars: number } | null;
  fundamentals: {
    source: string;
    latestPeriodEnd: string;
    quartersAvailable: number;
    annualsAvailable: number;
  } | null;
  keyMetrics: { source: string } | null;
  notes: string[];
}

export interface PePoint {
  /** ISO month end. */
  date: string;
  pe: number | null;
}

export interface MetricsResult {
  price: number | null;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  evToEbitda: number | null;
  priceToSales: number | null;
  fcfYield: number | null;
  dividendYield: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
  revenueGrowthYoY: number | null;
  revenueCagr3y: number | null;
  epsGrowthYoY: number | null;
  forwardGrowth: number | null;
  epsRevisionTrend: number | null;
  marginExpansion: number | null;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  return12m: number | null;
  relReturn1m: number | null;
  relReturn3m: number | null;
  relReturn6m: number | null;
  relReturn12m: number | null;
  earningsVolatility: number | null;
  fcfConsistency: number | null;
  sentiment90d: number | null;
  /** Monthly trailing-P/E history (~36 points) for compression risk. */
  peHistory: PePoint[];
  dataQuality: DataQuality;
}

/** Reporting lag assumed when a statement has no reportedAt (backtest safety). */
export const DEFAULT_REPORTING_LAG_DAYS = 45;
