import { prisma } from "@/lib/db/client";
import { addDays } from "@/lib/dates";
import { parseJsonColumn, type Rating } from "@/lib/db/json";
import {
  DataQualitySchema,
  ScorePayloadSchema,
  type ScorePayload,
} from "@/lib/pipeline/score-payload";
import { z } from "zod";

const FlagsSchema = z.array(z.string());

export interface StockMetrics {
  asOf: string;
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
  marginExpansion: number | null;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  return12m: number | null;
  relReturn12m: number | null;
  earningsVolatility: number | null;
  fcfConsistency: number | null;
  sentiment90d: number | null;
}

const EMPTY_METRICS: StockMetrics = {
  asOf: new Date(0).toISOString(),
  price: null, marketCap: null, pe: null, forwardPe: null, peg: null,
  evToEbitda: null, priceToSales: null, fcfYield: null, dividendYield: null,
  grossMargin: null, operatingMargin: null, netMargin: null, roe: null,
  roa: null, debtToEquity: null, netDebtToEbitda: null, interestCoverage: null,
  currentRatio: null, revenueGrowthYoY: null, revenueCagr3y: null,
  epsGrowthYoY: null, forwardGrowth: null, marginExpansion: null,
  return1m: null, return3m: null, return6m: null, return12m: null,
  relReturn12m: null, earningsVolatility: null, fcfConsistency: null,
  sentiment90d: null,
};

export interface StockDetail {
  company: {
    ticker: string;
    name: string;
    sector: string;
    industry: string;
    exchange: string;
    country: string;
    cik: string | null;
    description: string | null;
    website: string | null;
  };
  score: {
    date: string;
    overall: number;
    rating: Rating;
    ratingReason: string;
    rank: number | null;
    sectorRank: number | null;
    coverage: number;
    payload: ScorePayload | null;
  } | null;
  metrics: StockMetrics;
  dataQuality: z.infer<typeof DataQualitySchema> | null;
  priceSeries: { date: string; close: number }[];
  priceSource: string | null;
  annualTrend: {
    year: number;
    revenue: number | null;
    netIncome: number | null;
    operatingMargin: number | null;
    grossMargin: number | null;
    fcf: number | null;
    source: string;
  }[];
  quarterlyTrend: {
    periodEnd: string;
    revenue: number | null;
    eps: number | null;
    operatingMargin: number | null;
    fcf: number | null;
  }[];
  balanceSheet: {
    periodEnd: string;
    totalAssets: number | null;
    totalLiabilities: number | null;
    totalEquity: number | null;
    cash: number | null;
    totalDebt: number | null;
    source: string;
  } | null;
  dividend: {
    ttmDividendsPaid: number | null;
    dividendYield: number | null;
  };
  filings: {
    form: string;
    filedAt: string;
    title: string | null;
    url: string;
    flags: string[];
    source: string;
  }[];
  news: {
    publishedAt: string;
    title: string;
    url: string;
    source: string | null;
    summary: string | null;
    sentiment: number | null;
    provider: string;
  }[];
}

export async function getStockDetail(tickerRaw: string): Promise<StockDetail | null> {
  const ticker = tickerRaw.toUpperCase();
  const company = await prisma.company.findUnique({ where: { ticker } });
  if (!company || company.isIndex) return null;

  const score = await prisma.scoreSnapshot.findFirst({
    where: { companyId: company.id },
    orderBy: { date: "desc" },
  });
  const metric = await prisma.metricSnapshot.findFirst({
    where: { companyId: company.id },
    orderBy: { asOf: "desc" },
  });

  const yearAgo = addDays(new Date(), -400);
  const bars = await prisma.priceBar.findMany({
    where: { companyId: company.id, date: { gte: yearAgo } },
    orderBy: { date: "asc" },
    select: { date: true, close: true, source: true },
  });

  const annuals = await prisma.fundamentalsPeriod.findMany({
    where: { companyId: company.id, periodType: "ANNUAL" },
    orderBy: { periodEnd: "asc" },
  });
  const quarters = await prisma.fundamentalsPeriod.findMany({
    where: { companyId: company.id, periodType: "QUARTERLY" },
    orderBy: { periodEnd: "desc" },
    take: 8,
  });
  const latestBalance = quarters[0] ?? annuals.at(-1) ?? null;

  const filings = await prisma.filing.findMany({
    where: { companyId: company.id },
    orderBy: { filedAt: "desc" },
    take: 12,
  });
  const news = await prisma.newsItem.findMany({
    where: { companyId: company.id },
    orderBy: { publishedAt: "desc" },
    take: 10,
  });

  const ttmDividends =
    quarters.length >= 4
      ? quarters.slice(0, 4).reduce(
          (acc, q) => (q.dividendsPaid === null ? acc : (acc ?? 0) + q.dividendsPaid),
          null as number | null,
        )
      : null;

  return {
    company: {
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      exchange: company.exchange,
      country: company.country,
      cik: company.cik,
      description: company.description,
      website: company.website,
    },
    score: score
      ? {
          date: score.date.toISOString(),
          overall: score.overallScore,
          rating: score.rating as Rating,
          ratingReason: score.ratingReason,
          rank: score.rank,
          sectorRank: score.sectorRank,
          coverage: score.coverage,
          payload: parseJsonColumn(
            ScorePayloadSchema.nullable(),
            score.breakdownJson,
            null,
            "score.payload",
          ),
        }
      : null,
    metrics: metric
      ? {
          asOf: metric.asOf.toISOString(),
          price: metric.price,
          marketCap: metric.marketCap,
          pe: metric.pe,
          forwardPe: metric.forwardPe,
          peg: metric.peg,
          evToEbitda: metric.evToEbitda,
          priceToSales: metric.priceToSales,
          fcfYield: metric.fcfYield,
          dividendYield: metric.dividendYield,
          grossMargin: metric.grossMargin,
          operatingMargin: metric.operatingMargin,
          netMargin: metric.netMargin,
          roe: metric.roe,
          roa: metric.roa,
          debtToEquity: metric.debtToEquity,
          netDebtToEbitda: metric.netDebtToEbitda,
          interestCoverage: metric.interestCoverage,
          currentRatio: metric.currentRatio,
          revenueGrowthYoY: metric.revenueGrowthYoY,
          revenueCagr3y: metric.revenueCagr3y,
          epsGrowthYoY: metric.epsGrowthYoY,
          forwardGrowth: metric.forwardGrowth,
          marginExpansion: metric.marginExpansion,
          return1m: metric.return1m,
          return3m: metric.return3m,
          return6m: metric.return6m,
          return12m: metric.return12m,
          relReturn12m: metric.relReturn12m,
          earningsVolatility: metric.earningsVolatility,
          fcfConsistency: metric.fcfConsistency,
          sentiment90d: metric.sentiment90d,
        }
      : EMPTY_METRICS,
    dataQuality: metric
      ? parseJsonColumn(
          DataQualitySchema.nullable(),
          metric.dataQualityJson,
          null,
          "metric.dataQuality",
        )
      : null,
    priceSeries: bars.map((b) => ({
      date: b.date.toISOString().slice(0, 10),
      close: b.close,
    })),
    priceSource: bars.at(-1)?.source ?? null,
    annualTrend: annuals.map((a) => ({
      year: a.periodEnd.getUTCFullYear(),
      revenue: a.revenue,
      netIncome: a.netIncome,
      operatingMargin:
        a.operatingIncome !== null && a.revenue !== null && a.revenue > 0
          ? a.operatingIncome / a.revenue
          : null,
      grossMargin:
        a.grossProfit !== null && a.revenue !== null && a.revenue > 0
          ? a.grossProfit / a.revenue
          : null,
      fcf:
        a.operatingCashFlow !== null && a.capex !== null
          ? a.operatingCashFlow - a.capex
          : null,
      source: a.source,
    })),
    quarterlyTrend: [...quarters].reverse().map((q) => ({
      periodEnd: q.periodEnd.toISOString().slice(0, 10),
      revenue: q.revenue,
      eps: q.eps,
      operatingMargin:
        q.operatingIncome !== null && q.revenue !== null && q.revenue > 0
          ? q.operatingIncome / q.revenue
          : null,
      fcf:
        q.operatingCashFlow !== null && q.capex !== null
          ? q.operatingCashFlow - q.capex
          : null,
    })),
    balanceSheet: latestBalance
      ? {
          periodEnd: latestBalance.periodEnd.toISOString().slice(0, 10),
          totalAssets: latestBalance.totalAssets,
          totalLiabilities: latestBalance.totalLiabilities,
          totalEquity: latestBalance.totalEquity,
          cash: latestBalance.cash,
          totalDebt: latestBalance.totalDebt,
          source: latestBalance.source,
        }
      : null,
    dividend: {
      ttmDividendsPaid: ttmDividends,
      dividendYield: metric?.dividendYield ?? null,
    },
    filings: filings.map((f) => ({
      form: f.form,
      filedAt: f.filedAt.toISOString(),
      title: f.title,
      url: f.url,
      flags: parseJsonColumn(FlagsSchema, f.flagsJson, [], "filing.flags"),
      source: f.source,
    })),
    news: news.map((n) => ({
      publishedAt: n.publishedAt.toISOString(),
      title: n.title,
      url: n.url,
      source: n.source,
      summary: n.summary,
      sentiment: n.sentiment,
      provider: n.provider,
    })),
  };
}

/** All scored tickers (for nav/search components). */
export async function listTickers(): Promise<{ ticker: string; name: string }[]> {
  const companies = await prisma.company.findMany({
    where: { isIndex: false, isActive: true },
    orderBy: { ticker: "asc" },
    select: { ticker: true, name: true },
  });
  return companies;
}
