import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  FilingDTO,
  KeyMetricsDTO,
  MacroObservationDTO,
  NewsItemDTO,
  PriceBarDTO,
  StatementPeriodDTO,
} from "@/lib/providers/types";
import type { ProviderCategory } from "@/lib/db/json";
import { toJsonColumn } from "@/lib/db/json";

/**
 * Persistence helpers for the refresh pipeline. All writes are idempotent
 * (upserts / duplicate-tolerant inserts) so a re-run never duplicates rows.
 * Every function takes the PrismaClient explicitly so integration tests can
 * run against a scratch database.
 */

export async function insertNewPriceBars(
  db: PrismaClient,
  companyId: string,
  bars: PriceBarDTO[],
  source: string,
): Promise<number> {
  if (bars.length === 0) return 0;
  const result = await db.priceBar.createMany({
    data: bars.map((b) => ({
      companyId,
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      adjClose: b.adjClose,
      volume: b.volume,
      source,
    })),
  });
  return result.count;
}

/** Latest stored bar date for a company, or null. */
export async function latestPriceDate(
  db: PrismaClient,
  companyId: string,
): Promise<Date | null> {
  const row = await db.priceBar.findFirst({
    where: { companyId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

/** Run write operations in chunked transactions (SQLite-friendly batching). */
async function inChunkedTransactions(
  db: PrismaClient,
  operations: Prisma.PrismaPromise<unknown>[],
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < operations.length; i += chunkSize) {
    await db.$transaction(operations.slice(i, i + chunkSize));
  }
}

export async function upsertFundamentals(
  db: PrismaClient,
  companyId: string,
  periods: StatementPeriodDTO[],
  source: string,
): Promise<number> {
  const ops = periods.map((p) => {
    const data = {
      revenue: p.revenue ?? null,
      grossProfit: p.grossProfit ?? null,
      operatingIncome: p.operatingIncome ?? null,
      netIncome: p.netIncome ?? null,
      eps: p.eps ?? null,
      sharesOut: p.sharesOut ?? null,
      totalAssets: p.totalAssets ?? null,
      totalLiabilities: p.totalLiabilities ?? null,
      totalEquity: p.totalEquity ?? null,
      cash: p.cash ?? null,
      totalDebt: p.totalDebt ?? null,
      currentAssets: p.currentAssets ?? null,
      currentLiabilities: p.currentLiabilities ?? null,
      ebitda: p.ebitda ?? null,
      operatingCashFlow: p.operatingCashFlow ?? null,
      capex: p.capex ?? null,
      dividendsPaid: p.dividendsPaid ?? null,
      interestExpense: p.interestExpense ?? null,
      reportedAt: p.reportedAt ?? null,
      source,
    };
    return db.fundamentalsPeriod.upsert({
      where: {
        companyId_periodEnd_periodType: {
          companyId,
          periodEnd: p.periodEnd,
          periodType: p.periodType,
        },
      },
      create: {
        companyId,
        periodEnd: p.periodEnd,
        periodType: p.periodType,
        ...data,
      },
      update: data,
    });
  });
  await inChunkedTransactions(db, ops);
  return ops.length;
}

export async function upsertKeyMetrics(
  db: PrismaClient,
  companyId: string,
  asOf: Date,
  metrics: KeyMetricsDTO,
  source: string,
): Promise<number> {
  const data = {
    forwardPe: metrics.forwardPe ?? null,
    forwardGrowth: metrics.forwardGrowth ?? null,
    epsRevisionTrend: metrics.epsRevisionTrend ?? null,
    dividendYield: metrics.dividendYield ?? null,
    source,
  };
  await db.keyMetricsSnapshot.upsert({
    where: { companyId_asOf: { companyId, asOf } },
    create: { companyId, asOf, ...data },
    update: data,
  });
  return 1;
}

export async function upsertFilings(
  db: PrismaClient,
  companyId: string,
  filings: FilingDTO[],
  source: string,
): Promise<number> {
  const ops = filings.map((f) =>
    db.filing.upsert({
      where: { accessionNo: f.accessionNo },
      create: {
        companyId,
        accessionNo: f.accessionNo,
        form: f.form,
        filedAt: f.filedAt,
        title: f.title ?? null,
        url: f.url,
        flagsJson: toJsonColumn(f.flags),
        source,
      },
      update: {
        form: f.form,
        filedAt: f.filedAt,
        title: f.title ?? null,
        url: f.url,
        flagsJson: toJsonColumn(f.flags),
        source,
      },
    }),
  );
  await inChunkedTransactions(db, ops);
  return ops.length;
}

export async function latestFilingDate(
  db: PrismaClient,
  companyId: string,
): Promise<Date | null> {
  const row = await db.filing.findFirst({
    where: { companyId },
    orderBy: { filedAt: "desc" },
    select: { filedAt: true },
  });
  return row?.filedAt ?? null;
}

export async function upsertNews(
  db: PrismaClient,
  companyId: string,
  items: NewsItemDTO[],
  provider: string,
): Promise<number> {
  const ops = items.map((n) =>
    db.newsItem.upsert({
      where: { companyId_url: { companyId, url: n.url } },
      create: {
        companyId,
        publishedAt: n.publishedAt,
        title: n.title,
        url: n.url,
        source: n.source ?? null,
        summary: n.summary ?? null,
        sentiment: n.sentiment ?? null,
        provider,
      },
      update: {
        publishedAt: n.publishedAt,
        title: n.title,
        source: n.source ?? null,
        summary: n.summary ?? null,
        sentiment: n.sentiment ?? null,
        provider,
      },
    }),
  );
  await inChunkedTransactions(db, ops);
  return ops.length;
}

export async function latestNewsDate(
  db: PrismaClient,
  companyId: string,
): Promise<Date | null> {
  const row = await db.newsItem.findFirst({
    where: { companyId },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });
  return row?.publishedAt ?? null;
}

export async function upsertMacroObservations(
  db: PrismaClient,
  indicatorId: string,
  observations: MacroObservationDTO[],
  source: string,
): Promise<number> {
  const ops = observations.map((o) =>
    db.macroObservation.upsert({
      where: { indicatorId_date: { indicatorId, date: o.date } },
      create: { indicatorId, date: o.date, value: o.value, source },
      update: { value: o.value, source },
    }),
  );
  await inChunkedTransactions(db, ops);
  return ops.length;
}

export async function latestMacroDate(
  db: PrismaClient,
  indicatorId: string,
): Promise<Date | null> {
  const row = await db.macroObservation.findFirst({
    where: { indicatorId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

/** Upsert rolling provider health after each fallback attempt. */
export async function recordProviderHealth(
  db: PrismaClient,
  provider: string,
  category: ProviderCategory,
  ok: boolean,
  error?: string,
): Promise<void> {
  const now = new Date();
  if (ok) {
    await db.providerHealth.upsert({
      where: { provider_category: { provider, category } },
      create: { provider, category, lastSuccessAt: now, consecutiveFailures: 0 },
      update: { lastSuccessAt: now, consecutiveFailures: 0 },
    });
  } else {
    const existing = await db.providerHealth.findUnique({
      where: { provider_category: { provider, category } },
    });
    await db.providerHealth.upsert({
      where: { provider_category: { provider, category } },
      create: {
        provider,
        category,
        lastErrorAt: now,
        lastError: error ?? "unknown error",
        consecutiveFailures: 1,
      },
      update: {
        lastErrorAt: now,
        lastError: error ?? "unknown error",
        consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
      },
    });
  }
}
