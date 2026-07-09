import { describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { generateReport } from "@/lib/reports/generate";
import type { StockDetail } from "@/lib/queries/stock-detail";
import { computeScores } from "@/lib/scoring/overall";
import { buildNarrative } from "@/lib/scoring/narrative";
import { scoringInput } from "../helpers/scoring-fixtures";

function buildDetail(): StockDetail {
  const input = scoringInput({
    pe: 20,
    fcfYield: 0.04,
    priceToSales: 5,
    grossMargin: 0.5,
    operatingMargin: 0.22,
    roe: 0.2,
    debtToEquity: 0.5,
    netDebtToEbitda: 1,
    interestCoverage: 10,
    currentRatio: 1.8,
    revenueGrowthYoY: 0.12,
    epsGrowthYoY: 0.15,
    marginExpansion: 0.01,
    return1m: 0.02,
    relReturn1m: 0.01,
    relReturn3m: 0.03,
    relReturn6m: 0.05,
    relReturn12m: 0.1,
    earningsVolatility: 0.15,
    fcfConsistency: 0.9,
  });
  const breakdown = computeScores(input);
  const narrative = buildNarrative(input, breakdown);

  return {
    company: {
      ticker: "TESTCO",
      name: "Test Corporation",
      sector: "Information Technology",
      industry: "Software",
      exchange: "NASDAQ",
      country: "US",
      cik: "0000000000",
      description: "A fixture company used to exercise the report generator.",
      website: "https://example.com",
    },
    score: {
      date: utcDate(2026, 6, 10).toISOString(),
      overall: breakdown.overall,
      rating: breakdown.rating,
      ratingReason: breakdown.ratingReason,
      rank: 3,
      sectorRank: 1,
      coverage: breakdown.coverage,
      payload: { breakdown, narrative },
    },
    metrics: {
      asOf: utcDate(2026, 6, 10).toISOString(),
      price: 120, marketCap: 1.2e12, pe: 20, forwardPe: 18, peg: 1.3,
      evToEbitda: 12.5, priceToSales: 5, fcfYield: 0.04, dividendYield: 0.01,
      grossMargin: 0.5, operatingMargin: 0.22, netMargin: 0.15, roe: 0.2,
      roa: 0.12, debtToEquity: 0.5, netDebtToEbitda: 1, interestCoverage: 10,
      currentRatio: 1.8, revenueGrowthYoY: 0.12, revenueCagr3y: 0.1,
      epsGrowthYoY: 0.15, forwardGrowth: null, marginExpansion: 0.01,
      return1m: 0.02, return3m: 0.05, return6m: 0.08, return12m: 0.15,
      relReturn12m: 0.06, earningsVolatility: 0.15, fcfConsistency: 0.9,
      sentiment90d: 0.1,
    },
    dataQuality: {
      prices: { source: "mock", asOf: "2026-06-10", bars: 1600 },
      fundamentals: {
        source: "mock",
        latestPeriodEnd: "2026-03-31",
        quartersAvailable: 25,
        annualsAvailable: 6,
      },
      keyMetrics: { source: "mock" },
      notes: [],
    },
    priceSeries: [{ date: "2026-06-10", close: 120 }],
    priceSource: "mock",
    annualTrend: [
      { year: 2025, revenue: 4e11, netIncome: 6e10, operatingMargin: 0.22, grossMargin: 0.5, fcf: 5e10, source: "mock" },
    ],
    quarterlyTrend: [],
    balanceSheet: {
      periodEnd: "2026-03-31",
      totalAssets: 4e11, totalLiabilities: 2.5e11, totalEquity: 1.5e11,
      cash: 5e10, totalDebt: 1e11, source: "mock",
    },
    dividend: { ttmDividendsPaid: 1.2e10, dividendYield: 0.01 },
    filings: [
      {
        form: "10-K", filedAt: utcDate(2026, 2, 20).toISOString(),
        title: "Annual report", url: "https://example.com/10k",
        flags: [], source: "mock",
      },
    ],
    news: [
      {
        publishedAt: utcDate(2026, 6, 1).toISOString(),
        title: "TESTCO quarterly results review",
        url: "https://example.com/news", source: "Wire", summary: null,
        sentiment: 0.2, provider: "mock",
      },
    ],
  };
}

describe("generateReport", () => {
  const markdown = generateReport(buildDetail(), utcDate(2026, 7, 1));

  it("contains every required section in order", () => {
    const required = [
      "# Test Corporation (TESTCO)",
      "## Executive summary",
      "## Business overview",
      "## Financial snapshot",
      "## Valuation",
      "## Growth outlook",
      "## Risks",
      "## Recent developments",
      "## Score breakdown",
      "## Educational conclusion",
      "## Sources and timestamps",
      "## Data limitations",
    ];
    let cursor = -1;
    for (const heading of required) {
      const idx = markdown.indexOf(heading);
      expect(idx, `missing or out of order: ${heading}`).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it("includes sources, timestamps, and the disclaimer", () => {
    expect(markdown).toContain("Report generated: 2026-07-01");
    expect(markdown).toContain("Prices: mock");
    expect(markdown).toContain("Fundamentals: mock");
    expect(markdown).toContain("not a registered investment adviser");
    expect(markdown).toContain("mock");
  });

  it("frames the conclusion as model output, never advice", () => {
    expect(markdown).toMatch(/educational/i);
    expect(markdown).not.toMatch(/guaranteed|will go up|will rise|sure thing/i);
    expect(markdown).toContain("not investment advice");
  });

  it("renders the factor tables with raw -> normalized -> weight", () => {
    expect(markdown).toContain("| Factor | Raw | Normalized | Weight | Note |");
    expect(markdown).toContain("P/E vs sector median");
  });

  it("is deterministic for a fixed timestamp", () => {
    expect(generateReport(buildDetail(), utcDate(2026, 7, 1))).toBe(markdown);
  });
});
