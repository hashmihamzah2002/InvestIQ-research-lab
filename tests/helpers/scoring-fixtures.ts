import type { MetricsResult } from "@/lib/metrics/types";
import type { ScoringInput, SectorContext } from "@/lib/scoring/types";

/** MetricsResult with every field null — override what a test needs. */
export function emptyMetrics(over: Partial<MetricsResult> = {}): MetricsResult {
  return {
    price: null,
    marketCap: null,
    pe: null,
    forwardPe: null,
    peg: null,
    evToEbitda: null,
    priceToSales: null,
    fcfYield: null,
    dividendYield: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    roe: null,
    roa: null,
    debtToEquity: null,
    netDebtToEbitda: null,
    interestCoverage: null,
    currentRatio: null,
    revenueGrowthYoY: null,
    revenueCagr3y: null,
    epsGrowthYoY: null,
    forwardGrowth: null,
    epsRevisionTrend: null,
    marginExpansion: null,
    return1m: null,
    return3m: null,
    return6m: null,
    return12m: null,
    relReturn1m: null,
    relReturn3m: null,
    relReturn6m: null,
    relReturn12m: null,
    earningsVolatility: null,
    fcfConsistency: null,
    sentiment90d: null,
    peHistory: [],
    dataQuality: { prices: null, fundamentals: null, keyMetrics: null, notes: [] },
    ...over,
  };
}

export function sectorContext(over: Partial<SectorContext> = {}): SectorContext {
  return {
    sector: "Information Technology",
    groupSource: "sector",
    groupSize: 8,
    medianPe: 25,
    medianForwardPe: 22,
    medianEvToEbitda: 18,
    medianPriceToSales: 6,
    grossMargins: [0.3, 0.45, 0.55, 0.65, 0.7],
    pes: [15, 20, 25, 30, 40],
    ...over,
  };
}

export function scoringInput(
  metricsOver: Partial<MetricsResult> = {},
  inputOver: Partial<Omit<ScoringInput, "metrics">> = {},
): ScoringInput {
  return {
    ticker: "TESTCO",
    sector: "Information Technology",
    industry: "Software",
    metrics: emptyMetrics(metricsOver),
    filingFlags90d: [],
    filingFlags180d: [],
    sectorContext: sectorContext(),
    ...inputOver,
  };
}
