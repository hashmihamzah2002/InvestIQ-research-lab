import { addDays, utcDate } from "@/lib/dates";
import { computeMetrics } from "@/lib/metrics/compute";
import type { MetricsResult } from "@/lib/metrics/types";
import {
  generateDailyPrices,
  generateFundamentals,
  generateKeyMetrics,
  generateNews,
} from "@/lib/providers/mock/generators";
import { buildNarrative, type Narrative } from "@/lib/scoring/narrative";
import { computeScores } from "@/lib/scoring/overall";
import { buildSectorContexts } from "@/lib/scoring/sector-stats";
import type { ScoreBreakdown, ScoringInput } from "@/lib/scoring/types";
import { INDEX_TICKER, SEED_COMPANIES } from "../../prisma/data/universe";

export const SPREAD_ASOF = utcDate(2026, 6, 10);

export interface ScoredCompany {
  ticker: string;
  sector: string;
  industry: string;
  metrics: MetricsResult;
  breakdown: ScoreBreakdown;
  narrative: Narrative;
  input: ScoringInput;
}

/**
 * Pure-generator equivalent of the pipeline's metrics+scoring steps: mock
 * data -> computeMetrics -> sector stats -> computeScores for the whole
 * universe. Used by the spread test (rating distribution) and the compliance
 * test (narrative language) without any database.
 */
export function scoreUniverseFromGenerators(asOf: Date = SPREAD_ASOF): ScoredCompany[] {
  const spyCompany = SEED_COMPANIES.find((c) => c.ticker === INDEX_TICKER)!;
  const indexPrices = generateDailyPrices(spyCompany.ticker, spyCompany.mockProfile, {
    from: utcDate(2020, 1, 1),
    to: asOf,
  }).map((b) => ({ date: b.date, close: b.close }));

  const companies = SEED_COMPANIES.filter((c) => !c.isIndex);
  const metricsByTicker = new Map<string, MetricsResult>();

  for (const company of companies) {
    const prices = generateDailyPrices(company.ticker, company.mockProfile, {
      from: utcDate(2020, 1, 1),
      to: asOf,
    }).map((b) => ({ date: b.date, close: b.close }));
    const statements = generateFundamentals(company.ticker, company.mockProfile, asOf).map(
      (s) => ({ ...s, source: "mock" }) as const,
    );
    const km = generateKeyMetrics(company.ticker, company.mockProfile, asOf);
    const news = generateNews(
      company.ticker,
      company.mockProfile,
      company.sector,
      addDays(asOf, -90),
      asOf,
    );
    const sentiments = news
      .map((n) => n.sentiment)
      .filter((s): s is number => s !== null && s !== undefined);
    const sentiment90d =
      sentiments.length > 0
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
        : null;

    metricsByTicker.set(
      company.ticker,
      computeMetrics({
        asOf,
        prices,
        indexPrices,
        statements: statements.map((s) => ({
          periodEnd: s.periodEnd,
          periodType: s.periodType,
          revenue: s.revenue ?? null,
          grossProfit: s.grossProfit ?? null,
          operatingIncome: s.operatingIncome ?? null,
          netIncome: s.netIncome ?? null,
          eps: s.eps ?? null,
          sharesOut: s.sharesOut ?? null,
          totalAssets: s.totalAssets ?? null,
          totalLiabilities: s.totalLiabilities ?? null,
          totalEquity: s.totalEquity ?? null,
          cash: s.cash ?? null,
          totalDebt: s.totalDebt ?? null,
          currentAssets: s.currentAssets ?? null,
          currentLiabilities: s.currentLiabilities ?? null,
          ebitda: s.ebitda ?? null,
          operatingCashFlow: s.operatingCashFlow ?? null,
          capex: s.capex ?? null,
          dividendsPaid: s.dividendsPaid ?? null,
          interestExpense: s.interestExpense ?? null,
          reportedAt: s.reportedAt ?? null,
          source: "mock",
        })),
        keyMetrics: {
          forwardPe: km.forwardPe ?? null,
          forwardGrowth: km.forwardGrowth ?? null,
          epsRevisionTrend: km.epsRevisionTrend ?? null,
          dividendYield: km.dividendYield ?? null,
          source: "mock",
        },
        newsSentiment90d: sentiment90d,
        priceSource: "mock",
      }),
    );
  }

  const contexts = buildSectorContexts(
    companies.map((c) => {
      const m = metricsByTicker.get(c.ticker)!;
      return {
        ticker: c.ticker,
        sector: c.sector,
        pe: m.pe,
        forwardPe: m.forwardPe,
        evToEbitda: m.evToEbitda,
        priceToSales: m.priceToSales,
        grossMargin: m.grossMargin,
      };
    }),
  );

  return companies.map((c) => {
    const metrics = metricsByTicker.get(c.ticker)!;
    const input: ScoringInput = {
      ticker: c.ticker,
      sector: c.sector,
      industry: c.industry,
      metrics,
      filingFlags90d: [],
      filingFlags180d: [],
      sectorContext: contexts.get(c.ticker)!,
    };
    const breakdown = computeScores(input);
    return {
      ticker: c.ticker,
      sector: c.sector,
      industry: c.industry,
      metrics,
      breakdown,
      narrative: buildNarrative(input, breakdown),
      input,
    };
  });
}
