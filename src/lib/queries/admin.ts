import { prisma } from "@/lib/db/client";
import { getEnv, parseProviderChain } from "@/lib/config/env";
import { addDays, todayUtc } from "@/lib/dates";
import { parseJsonColumn } from "@/lib/db/json";
import { StepResultsSchema, type StepResult } from "@/lib/pipeline/types";

export interface RunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  status: string;
  steps: StepResult[];
}

export interface ProviderHealthRow {
  provider: string;
  category: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface KeyStatus {
  name: string;
  configured: boolean;
  usedBy: string;
}

export interface CoverageRow {
  ticker: string;
  isIndex: boolean;
  prices: { count: number; latest: string | null; fresh: boolean };
  fundamentals: { count: number; latest: string | null; fresh: boolean };
  filings: { count: number; latest: string | null; fresh: boolean };
  news: { count: number; latest: string | null; fresh: boolean };
  hasMetrics: boolean;
  hasScore: boolean;
}

export interface ImportJobRow {
  kind: string;
  filename: string;
  rowsOk: number;
  rowsFailed: number;
  createdAt: string;
}

export interface AdminOverview {
  runs: RunRow[];
  providerHealth: ProviderHealthRow[];
  keys: KeyStatus[];
  chains: { category: string; chain: string[] }[];
  coverage: CoverageRow[];
  imports: ImportJobRow[];
  staleCompanies: string[];
  missingScores: string[];
}

/** Freshness horizons per category (days) for the coverage matrix. */
const FRESH_DAYS = { prices: 5, fundamentals: 120, filings: 120, news: 21 } as const;

export async function getAdminOverview(): Promise<AdminOverview> {
  const env = getEnv();
  const now = todayUtc();

  const runs = (
    await prisma.updateRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 })
  ).map((run) => ({
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    trigger: run.trigger,
    status: run.status,
    steps: parseJsonColumn(StepResultsSchema, run.stepsJson, [], "run.steps"),
  }));

  const providerHealth = (
    await prisma.providerHealth.findMany({
      orderBy: [{ provider: "asc" }, { category: "asc" }],
    })
  ).map((h) => ({
    provider: h.provider,
    category: h.category,
    lastSuccessAt: h.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: h.lastErrorAt?.toISOString() ?? null,
    lastError: h.lastError,
    consecutiveFailures: h.consecutiveFailures,
  }));

  // Key status — presence only, values never leave the server.
  const keys: KeyStatus[] = [
    { name: "SEC_EDGAR_USER_AGENT", configured: Boolean(env.SEC_EDGAR_USER_AGENT), usedBy: "sec-edgar (filings + XBRL fundamentals)" },
    { name: "FRED_API_KEY", configured: Boolean(env.FRED_API_KEY), usedBy: "fred (macro)" },
    { name: "ALPHA_VANTAGE_API_KEY", configured: Boolean(env.ALPHA_VANTAGE_API_KEY), usedBy: "alpha-vantage (prices, fundamentals)" },
    { name: "FINNHUB_API_KEY", configured: Boolean(env.FINNHUB_API_KEY), usedBy: "finnhub (prices, news)" },
    { name: "FMP_API_KEY", configured: Boolean(env.FMP_API_KEY), usedBy: "fmp (fundamentals)" },
  ];
  const chains = [
    { category: "market-data", chain: parseProviderChain(env.MARKET_DATA_PROVIDERS) },
    { category: "fundamentals", chain: parseProviderChain(env.FUNDAMENTALS_PROVIDERS) },
    { category: "filings", chain: parseProviderChain(env.FILINGS_PROVIDERS) },
    { category: "news", chain: parseProviderChain(env.NEWS_PROVIDERS) },
    { category: "macro", chain: parseProviderChain(env.MACRO_PROVIDERS) },
  ];

  // Coverage matrix.
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    orderBy: [{ isIndex: "asc" }, { ticker: "asc" }],
    select: { id: true, ticker: true, isIndex: true },
  });
  const latestMetric = await prisma.metricSnapshot.findFirst({
    orderBy: { asOf: "desc" },
    select: { asOf: true },
  });
  const metricCompanyIds = latestMetric
    ? new Set(
        (
          await prisma.metricSnapshot.findMany({
            where: { asOf: latestMetric.asOf },
            select: { companyId: true },
          })
        ).map((m) => m.companyId),
      )
    : new Set<string>();
  const latestScore = await prisma.scoreSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const scoreCompanyIds = latestScore
    ? new Set(
        (
          await prisma.scoreSnapshot.findMany({
            where: { date: latestScore.date },
            select: { companyId: true },
          })
        ).map((s) => s.companyId),
      )
    : new Set<string>();

  const coverage: CoverageRow[] = [];
  for (const company of companies) {
    const [priceAgg, fundAgg, filingAgg, newsAgg] = await Promise.all([
      prisma.priceBar.aggregate({
        where: { companyId: company.id },
        _count: true,
        _max: { date: true },
      }),
      prisma.fundamentalsPeriod.aggregate({
        where: { companyId: company.id },
        _count: true,
        _max: { periodEnd: true },
      }),
      prisma.filing.aggregate({
        where: { companyId: company.id },
        _count: true,
        _max: { filedAt: true },
      }),
      prisma.newsItem.aggregate({
        where: { companyId: company.id },
        _count: true,
        _max: { publishedAt: true },
      }),
    ]);

    const cell = (
      count: number,
      latest: Date | null,
      freshDays: number,
    ): { count: number; latest: string | null; fresh: boolean } => ({
      count,
      latest: latest?.toISOString().slice(0, 10) ?? null,
      fresh:
        latest !== null &&
        latest.getTime() >= addDays(now, -freshDays).getTime(),
    });

    coverage.push({
      ticker: company.ticker,
      isIndex: company.isIndex,
      prices: cell(priceAgg._count, priceAgg._max.date, FRESH_DAYS.prices),
      fundamentals: cell(fundAgg._count, fundAgg._max.periodEnd, FRESH_DAYS.fundamentals),
      filings: cell(filingAgg._count, filingAgg._max.filedAt, FRESH_DAYS.filings),
      news: cell(newsAgg._count, newsAgg._max.publishedAt, FRESH_DAYS.news),
      hasMetrics: metricCompanyIds.has(company.id),
      hasScore: scoreCompanyIds.has(company.id),
    });
  }

  const staleCompanies = coverage
    .filter((c) => !c.isIndex && (!c.prices.fresh || !c.fundamentals.fresh))
    .map((c) => c.ticker);
  const missingScores = coverage
    .filter((c) => !c.isIndex && !c.hasScore)
    .map((c) => c.ticker);

  const imports = (
    await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
  ).map((j) => ({
    kind: j.kind,
    filename: j.filename,
    rowsOk: j.rowsOk,
    rowsFailed: j.rowsFailed,
    createdAt: j.createdAt.toISOString(),
  }));

  return {
    runs,
    providerHealth,
    keys,
    chains,
    coverage,
    imports,
    staleCompanies,
    missingScores,
  };
}
