import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { addDays, isoDay } from "@/lib/dates";
import { parseJsonColumn } from "@/lib/db/json";
import { computeMetrics } from "@/lib/metrics/compute";
import type { PricePoint, StatementRow } from "@/lib/metrics/types";
import { log } from "@/lib/logging/logger";
import { buildSectorContexts } from "@/lib/scoring/sector-stats";
import { computeScores } from "@/lib/scoring/overall";
import type { ScoringInput } from "@/lib/scoring/types";
import { z } from "zod";
import {
  runBacktest,
  type BacktestParams,
  type BacktestResult,
  type BacktestStrategy,
} from "@/lib/backtest/engine";

/**
 * DB-facing backtest runner: preloads the universe once, then re-scores it
 * as of each rebalance date with the SAME pure metrics+scoring engine the
 * daily pipeline uses. As-of gating (reportedAt / +45d) prevents look-ahead;
 * provider estimates are historically unavailable and simply drop out.
 */
const FlagsSchema = z.array(z.string());

interface UniverseData {
  companies: {
    id: string;
    ticker: string;
    sector: string;
    industry: string;
  }[];
  pricesByTicker: Map<string, PricePoint[]>;
  statementsByTicker: Map<string, StatementRow[]>;
  filingsByTicker: Map<string, { filedAt: Date; flags: string[] }[]>;
  sentimentByTicker: Map<string, { publishedAt: Date; sentiment: number }[]>;
  indexPrices: PricePoint[];
}

async function loadUniverse(db: PrismaClient): Promise<UniverseData> {
  const companies = await db.company.findMany({
    where: { isActive: true, isIndex: false },
    select: { id: true, ticker: true, sector: true, industry: true },
  });
  const index = await db.company.findFirst({ where: { ticker: "SPY" } });

  const pricesByTicker = new Map<string, PricePoint[]>();
  const statementsByTicker = new Map<string, StatementRow[]>();
  const filingsByTicker = new Map<string, { filedAt: Date; flags: string[] }[]>();
  const sentimentByTicker = new Map<string, { publishedAt: Date; sentiment: number }[]>();

  for (const company of companies) {
    const bars = await db.priceBar.findMany({
      where: { companyId: company.id },
      orderBy: { date: "asc" },
      select: { date: true, close: true },
    });
    pricesByTicker.set(company.ticker, bars);

    const statements = await db.fundamentalsPeriod.findMany({
      where: { companyId: company.id },
      orderBy: { periodEnd: "asc" },
    });
    statementsByTicker.set(
      company.ticker,
      statements.map((r) => ({
        periodEnd: r.periodEnd,
        periodType: r.periodType === "ANNUAL" ? "ANNUAL" : "QUARTERLY",
        revenue: r.revenue,
        grossProfit: r.grossProfit,
        operatingIncome: r.operatingIncome,
        netIncome: r.netIncome,
        eps: r.eps,
        sharesOut: r.sharesOut,
        totalAssets: r.totalAssets,
        totalLiabilities: r.totalLiabilities,
        totalEquity: r.totalEquity,
        cash: r.cash,
        totalDebt: r.totalDebt,
        currentAssets: r.currentAssets,
        currentLiabilities: r.currentLiabilities,
        ebitda: r.ebitda,
        operatingCashFlow: r.operatingCashFlow,
        capex: r.capex,
        dividendsPaid: r.dividendsPaid,
        interestExpense: r.interestExpense,
        reportedAt: r.reportedAt,
        source: r.source,
      })),
    );

    const filings = await db.filing.findMany({
      where: { companyId: company.id },
      select: { filedAt: true, flagsJson: true },
    });
    filingsByTicker.set(
      company.ticker,
      filings.map((f) => ({
        filedAt: f.filedAt,
        flags: parseJsonColumn(FlagsSchema, f.flagsJson, [], "filing.flags"),
      })),
    );

    const news = await db.newsItem.findMany({
      where: { companyId: company.id, sentiment: { not: null } },
      select: { publishedAt: true, sentiment: true },
    });
    sentimentByTicker.set(
      company.ticker,
      news.map((n) => ({ publishedAt: n.publishedAt, sentiment: n.sentiment! })),
    );
  }

  const indexPrices = index
    ? await db.priceBar.findMany({
        where: { companyId: index.id },
        orderBy: { date: "asc" },
        select: { date: true, close: true },
      })
    : [];

  return {
    companies,
    pricesByTicker,
    statementsByTicker,
    filingsByTicker,
    sentimentByTicker,
    indexPrices,
  };
}

function scoresAsOf(
  universe: UniverseData,
  date: Date,
  strategy: BacktestStrategy,
): { ticker: string; score: number }[] {
  // Metrics for every company as of this date.
  const metricsRows = universe.companies.map((company) => {
    const metrics = computeMetrics({
      asOf: date,
      prices: universe.pricesByTicker.get(company.ticker) ?? [],
      indexPrices: universe.indexPrices,
      statements: universe.statementsByTicker.get(company.ticker) ?? [],
      keyMetrics: null, // provider estimates unavailable historically
      newsSentiment90d: trailingSentiment(universe, company.ticker, date),
      priceSource: "backtest",
    });
    return { company, metrics };
  });

  const contexts = buildSectorContexts(
    metricsRows.map(({ company, metrics }) => ({
      ticker: company.ticker,
      sector: company.sector,
      pe: metrics.pe,
      forwardPe: metrics.forwardPe,
      evToEbitda: metrics.evToEbitda,
      priceToSales: metrics.priceToSales,
      grossMargin: metrics.grossMargin,
    })),
  );

  const out: { ticker: string; score: number }[] = [];
  for (const { company, metrics } of metricsRows) {
    const context = contexts.get(company.ticker);
    if (!context) continue;
    const flags = flagsAsOf(universe, company.ticker, date);
    const input: ScoringInput = {
      ticker: company.ticker,
      sector: company.sector,
      industry: company.industry,
      metrics,
      filingFlags90d: flags.short,
      filingFlags180d: flags.long,
      sectorContext: context,
    };
    const breakdown = computeScores(input);
    const score =
      strategy === "overall"
        ? breakdown.overall
        : (breakdown.pillars.find((p) => p.key === strategy)?.score ?? null);
    // Skip companies the model cannot score at this date (e.g. pre-IPO).
    if (score === null || breakdown.coverage < 0.5) continue;
    out.push({ ticker: company.ticker, score });
  }
  return out;
}

function trailingSentiment(
  universe: UniverseData,
  ticker: string,
  date: Date,
): number | null {
  const cutoff = addDays(date, -90).getTime();
  const items = (universe.sentimentByTicker.get(ticker) ?? []).filter(
    (n) => n.publishedAt.getTime() >= cutoff && n.publishedAt.getTime() <= date.getTime(),
  );
  if (items.length === 0) return null;
  return items.reduce((a, n) => a + n.sentiment, 0) / items.length;
}

function flagsAsOf(
  universe: UniverseData,
  ticker: string,
  date: Date,
): { short: string[]; long: string[] } {
  const short = new Set<string>();
  const long = new Set<string>();
  const shortCutoff = addDays(date, -90).getTime();
  const longCutoff = addDays(date, -180).getTime();
  for (const filing of universe.filingsByTicker.get(ticker) ?? []) {
    const t = filing.filedAt.getTime();
    if (t > date.getTime() || filing.flags.length === 0) continue;
    if (t >= longCutoff) filing.flags.forEach((f) => long.add(f));
    if (t >= shortCutoff) filing.flags.forEach((f) => short.add(f));
  }
  return { short: [...short], long: [...long] };
}

export async function runBacktestFromDb(
  params: BacktestParams,
  db: PrismaClient = prisma,
): Promise<BacktestResult> {
  const started = Date.now();
  const universe = await loadUniverse(db);
  if (universe.indexPrices.length === 0) {
    throw new Error("No benchmark (SPY) prices loaded — run a refresh first.");
  }

  const tradingDays = universe.indexPrices
    .map((p) => p.date)
    .filter(
      (d) => d.getTime() >= params.start.getTime() && d.getTime() <= params.end.getTime(),
    );

  const prices = new Map<string, Map<string, number>>();
  for (const [ticker, bars] of universe.pricesByTicker) {
    prices.set(ticker, forwardFill(bars, tradingDays));
  }
  const benchmark = new Map(
    universe.indexPrices.map((p) => [isoDay(p.date), p.close]),
  );

  const rankCache = new Map<string, { ticker: string; score: number }[]>();
  const result = runBacktest(
    {
      tradingDays,
      prices,
      benchmark,
      ranksAt: (date) => {
        const key = isoDay(date);
        let ranks = rankCache.get(key);
        if (!ranks) {
          ranks = scoresAsOf(universe, date, params.strategy);
          rankCache.set(key, ranks);
        }
        return ranks;
      },
    },
    params,
  );

  log.info("backtest.completed", {
    strategy: params.strategy,
    topN: params.topN,
    rebalance: params.rebalance,
    days: result.stats.tradingDays,
    durationMs: Date.now() - started,
  });
  return result;
}

/** Forward-fill ticker closes onto the benchmark trading-day grid. */
function forwardFill(
  bars: PricePoint[],
  tradingDays: Date[],
): Map<string, number> {
  const out = new Map<string, number>();
  let idx = 0;
  let last: number | null = null;
  for (const day of tradingDays) {
    while (idx < bars.length && bars[idx].date.getTime() <= day.getTime()) {
      last = bars[idx].close;
      idx++;
    }
    if (last !== null) out.set(isoDay(day), last);
  }
  return out;
}
