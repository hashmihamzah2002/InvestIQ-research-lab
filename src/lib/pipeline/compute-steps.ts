import type { PrismaClient } from "@/generated/prisma/client";
import { addDays } from "@/lib/dates";
import { toJsonColumn } from "@/lib/db/json";
import { computeMetrics } from "@/lib/metrics/compute";
import type { KeyMetricsInput, StatementRow } from "@/lib/metrics/types";
import { pruneExpiredCache } from "@/lib/providers/cache";
import { buildNarrative } from "@/lib/scoring/narrative";
import { computeScores } from "@/lib/scoring/overall";
import { buildSectorContexts } from "@/lib/scoring/sector-stats";
import type { ScoringInput } from "@/lib/scoring/types";
import { PeHistorySchema } from "./score-payload";
import { parseJsonColumn } from "@/lib/db/json";
import { z } from "zod";
import type { CompanyRow, PipelineStep, StepContext } from "./types";

/**
 * Compute steps: pure functions (lib/metrics, lib/scoring) fed from the DB
 * and persisted back. Same isolation contract as fetch steps — one company
 * failing is recorded and skipped.
 */

const INDEX_TICKER = "SPY";
const FLAGS_LOOKBACK_SHORT_DAYS = 90;
const FLAGS_LOOKBACK_LONG_DAYS = 180;

async function loadStatements(
  db: PrismaClient,
  companyId: string,
): Promise<StatementRow[]> {
  const rows = await db.fundamentalsPeriod.findMany({
    where: { companyId },
    orderBy: { periodEnd: "asc" },
  });
  return rows.map((r) => ({
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
  }));
}

export const metricsStep: PipelineStep = {
  name: "metrics",
  async run(ctx: StepContext) {
    const errors: string[] = [];
    let items = 0;
    const asOf = ctx.provider.asOf;

    const index = ctx.companies.find((c) => c.ticker === INDEX_TICKER);
    const indexPrices = index
      ? (
          await ctx.db.priceBar.findMany({
            where: { companyId: index.id },
            orderBy: { date: "asc" },
            select: { date: true, close: true },
          })
        ).map((b) => ({ date: b.date, close: b.close }))
      : [];

    for (const company of scoredCompanies(ctx)) {
      try {
        const bars = await ctx.db.priceBar.findMany({
          where: { companyId: company.id },
          orderBy: { date: "asc" },
          select: { date: true, close: true, source: true },
        });
        const statements = await loadStatements(ctx.db, company.id);
        const km = await ctx.db.keyMetricsSnapshot.findFirst({
          where: { companyId: company.id },
          orderBy: { asOf: "desc" },
        });
        const keyMetrics: KeyMetricsInput | null = km
          ? {
              forwardPe: km.forwardPe,
              forwardGrowth: km.forwardGrowth,
              epsRevisionTrend: km.epsRevisionTrend,
              dividendYield: km.dividendYield,
              source: km.source,
            }
          : null;
        const sentimentAgg = await ctx.db.newsItem.aggregate({
          where: {
            companyId: company.id,
            publishedAt: { gte: addDays(asOf, -FLAGS_LOOKBACK_SHORT_DAYS) },
            sentiment: { not: null },
          },
          _avg: { sentiment: true },
        });

        const metrics = computeMetrics({
          asOf,
          prices: bars.map((b) => ({ date: b.date, close: b.close })),
          indexPrices,
          statements,
          keyMetrics,
          newsSentiment90d: sentimentAgg._avg.sentiment,
          priceSource: bars.at(-1)?.source ?? "unknown",
        });

        const data = {
          price: metrics.price,
          marketCap: metrics.marketCap,
          pe: metrics.pe,
          forwardPe: metrics.forwardPe,
          peg: metrics.peg,
          evToEbitda: metrics.evToEbitda,
          priceToSales: metrics.priceToSales,
          fcfYield: metrics.fcfYield,
          dividendYield: metrics.dividendYield,
          grossMargin: metrics.grossMargin,
          operatingMargin: metrics.operatingMargin,
          netMargin: metrics.netMargin,
          roe: metrics.roe,
          roa: metrics.roa,
          debtToEquity: metrics.debtToEquity,
          netDebtToEbitda: metrics.netDebtToEbitda,
          interestCoverage: metrics.interestCoverage,
          currentRatio: metrics.currentRatio,
          revenueGrowthYoY: metrics.revenueGrowthYoY,
          revenueCagr3y: metrics.revenueCagr3y,
          epsGrowthYoY: metrics.epsGrowthYoY,
          forwardGrowth: metrics.forwardGrowth,
          marginExpansion: metrics.marginExpansion,
          return1m: metrics.return1m,
          return3m: metrics.return3m,
          return6m: metrics.return6m,
          return12m: metrics.return12m,
          relReturn1m: metrics.relReturn1m,
          relReturn3m: metrics.relReturn3m,
          relReturn6m: metrics.relReturn6m,
          relReturn12m: metrics.relReturn12m,
          earningsVolatility: metrics.earningsVolatility,
          fcfConsistency: metrics.fcfConsistency,
          sentiment90d: metrics.sentiment90d,
          peHistoryJson: toJsonColumn(metrics.peHistory),
          dataQualityJson: toJsonColumn(metrics.dataQuality),
        };
        await ctx.db.metricSnapshot.upsert({
          where: { companyId_asOf: { companyId: company.id, asOf } },
          create: { companyId: company.id, asOf, ...data },
          update: data,
        });
        items++;
      } catch (err) {
        errors.push(
          `${company.ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { items, errors, providers: new Set<string>() };
  },
};

export const scoresStep: PipelineStep = {
  name: "scores",
  async run(ctx: StepContext) {
    const errors: string[] = [];
    const asOf = ctx.provider.asOf;
    const companies = scoredCompanies(ctx);

    const snapshots = await ctx.db.metricSnapshot.findMany({
      where: { asOf, companyId: { in: companies.map((c) => c.id) } },
    });
    const byCompanyId = new Map(snapshots.map((s) => [s.companyId, s]));

    // Sector stats come from the WHOLE universe even when --tickers narrows
    // the run; comparisons must not shift with the filter.
    const allCompanies = ctx.companies.filter((c) => !c.isIndex);
    const allSnapshots = await ctx.db.metricSnapshot.findMany({
      where: { asOf, companyId: { in: allCompanies.map((c) => c.id) } },
    });
    const contexts = buildSectorContexts(
      allCompanies
        .map((c) => {
          const s = allSnapshots.find((x) => x.companyId === c.id);
          if (!s) return null;
          return {
            ticker: c.ticker,
            sector: c.sector,
            pe: s.pe,
            forwardPe: s.forwardPe,
            evToEbitda: s.evToEbitda,
            priceToSales: s.priceToSales,
            grossMargin: s.grossMargin,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );

    interface ScoredRow {
      company: CompanyRow;
      overall: number;
      sector: string;
      persisted: boolean;
    }
    const scoredRows: ScoredRow[] = [];

    for (const company of companies) {
      try {
        const snapshot = byCompanyId.get(company.id);
        const context = contexts.get(company.ticker);
        if (!snapshot || !context) {
          errors.push(`${company.ticker}: no metric snapshot for ${asOf.toISOString().slice(0, 10)}`);
          continue;
        }

        const flags = await loadFilingFlags(ctx.db, company.id, asOf);
        const input: ScoringInput = {
          ticker: company.ticker,
          sector: company.sector,
          industry: company.industry,
          metrics: {
            price: snapshot.price,
            marketCap: snapshot.marketCap,
            pe: snapshot.pe,
            forwardPe: snapshot.forwardPe,
            peg: snapshot.peg,
            evToEbitda: snapshot.evToEbitda,
            priceToSales: snapshot.priceToSales,
            fcfYield: snapshot.fcfYield,
            dividendYield: snapshot.dividendYield,
            grossMargin: snapshot.grossMargin,
            operatingMargin: snapshot.operatingMargin,
            netMargin: snapshot.netMargin,
            roe: snapshot.roe,
            roa: snapshot.roa,
            debtToEquity: snapshot.debtToEquity,
            netDebtToEbitda: snapshot.netDebtToEbitda,
            interestCoverage: snapshot.interestCoverage,
            currentRatio: snapshot.currentRatio,
            revenueGrowthYoY: snapshot.revenueGrowthYoY,
            revenueCagr3y: snapshot.revenueCagr3y,
            epsGrowthYoY: snapshot.epsGrowthYoY,
            forwardGrowth: snapshot.forwardGrowth,
            epsRevisionTrend: null,
            marginExpansion: snapshot.marginExpansion,
            return1m: snapshot.return1m,
            return3m: snapshot.return3m,
            return6m: snapshot.return6m,
            return12m: snapshot.return12m,
            relReturn1m: snapshot.relReturn1m,
            relReturn3m: snapshot.relReturn3m,
            relReturn6m: snapshot.relReturn6m,
            relReturn12m: snapshot.relReturn12m,
            earningsVolatility: snapshot.earningsVolatility,
            fcfConsistency: snapshot.fcfConsistency,
            sentiment90d: snapshot.sentiment90d,
            peHistory: parseJsonColumn(PeHistorySchema, snapshot.peHistoryJson, [], "peHistory"),
            dataQuality: { prices: null, fundamentals: null, keyMetrics: null, notes: [] },
          },
          filingFlags90d: flags.short,
          filingFlags180d: flags.long,
          sectorContext: context,
        };
        // Restore provider revision data (stored on KeyMetricsSnapshot).
        const km = await ctx.db.keyMetricsSnapshot.findFirst({
          where: { companyId: company.id },
          orderBy: { asOf: "desc" },
          select: { epsRevisionTrend: true },
        });
        input.metrics.epsRevisionTrend = km?.epsRevisionTrend ?? null;

        const breakdown = computeScores(input);
        const narrative = buildNarrative(input, breakdown);

        await ctx.db.scoreSnapshot.upsert({
          where: { companyId_date: { companyId: company.id, date: asOf } },
          create: {
            companyId: company.id,
            date: asOf,
            valuationScore: pillarScore(breakdown, "valuation"),
            qualityScore: pillarScore(breakdown, "quality"),
            growthScore: pillarScore(breakdown, "growth"),
            momentumScore: pillarScore(breakdown, "momentum"),
            riskScore: pillarScore(breakdown, "risk"),
            overallScore: breakdown.overall,
            coverage: breakdown.coverage,
            rating: breakdown.rating,
            ratingReason: breakdown.ratingReason,
            breakdownJson: toJsonColumn({ breakdown, narrative }),
          },
          update: {
            valuationScore: pillarScore(breakdown, "valuation"),
            qualityScore: pillarScore(breakdown, "quality"),
            growthScore: pillarScore(breakdown, "growth"),
            momentumScore: pillarScore(breakdown, "momentum"),
            riskScore: pillarScore(breakdown, "risk"),
            overallScore: breakdown.overall,
            coverage: breakdown.coverage,
            rating: breakdown.rating,
            ratingReason: breakdown.ratingReason,
            breakdownJson: toJsonColumn({ breakdown, narrative }),
          },
        });
        scoredRows.push({
          company,
          overall: breakdown.overall,
          sector: company.sector,
          persisted: true,
        });
      } catch (err) {
        errors.push(
          `${company.ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // --- Ranks (deterministic: overall desc, ticker asc tie-break) ---
    // Ranking is meaningful only over the full universe; when a ticker
    // filter is active, re-rank using every snapshot present for asOf.
    const allScores = await ctx.db.scoreSnapshot.findMany({
      where: { date: asOf },
      select: { id: true, companyId: true, overallScore: true },
    });
    const tickerById = new Map(ctx.companies.map((c) => [c.id, c.ticker]));
    const sectorById = new Map(ctx.companies.map((c) => [c.id, c.sector]));
    const sorted = [...allScores].sort((a, b) => {
      if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
      return (tickerById.get(a.companyId) ?? "").localeCompare(
        tickerById.get(b.companyId) ?? "",
      );
    });
    const sectorCounters = new Map<string, number>();
    const rankOps = sorted.map((row, idx) => {
      const sector = sectorById.get(row.companyId) ?? "?";
      const sectorRank = (sectorCounters.get(sector) ?? 0) + 1;
      sectorCounters.set(sector, sectorRank);
      return ctx.db.scoreSnapshot.update({
        where: { id: row.id },
        data: { rank: idx + 1, sectorRank },
      });
    });
    await ctx.db.$transaction(rankOps);

    return {
      items: scoredRows.length,
      errors,
      providers: new Set<string>(),
    };
  },
};

export const maintenanceStep: PipelineStep = {
  name: "maintenance",
  async run(ctx: StepContext) {
    const pruned = await pruneExpiredCache(ctx.db, new Date());
    ctx.provider.log.info("maintenance.cache_pruned", { pruned });
    return { items: pruned, errors: [], providers: new Set<string>() };
  },
};

// ---------------------------------------------------------------------------

function scoredCompanies(ctx: StepContext): CompanyRow[] {
  return ctx.companies.filter((c) => {
    if (c.isIndex) return false;
    if (ctx.tickerFilter && !ctx.tickerFilter.has(c.ticker)) return false;
    return true;
  });
}

function pillarScore(
  breakdown: ReturnType<typeof computeScores>,
  key: "valuation" | "quality" | "growth" | "momentum" | "risk",
): number | null {
  return breakdown.pillars.find((p) => p.key === key)?.score ?? null;
}

const FlagsSchema = z.array(z.string());

async function loadFilingFlags(
  db: PrismaClient,
  companyId: string,
  asOf: Date,
): Promise<{ short: string[]; long: string[] }> {
  const filings = await db.filing.findMany({
    where: {
      companyId,
      filedAt: { gte: addDays(asOf, -FLAGS_LOOKBACK_LONG_DAYS), lte: asOf },
    },
    select: { filedAt: true, flagsJson: true },
  });
  const short: string[] = [];
  const long: string[] = [];
  const shortCutoff = addDays(asOf, -FLAGS_LOOKBACK_SHORT_DAYS).getTime();
  for (const filing of filings) {
    const flags = parseJsonColumn(FlagsSchema, filing.flagsJson, [], "filing.flags");
    long.push(...flags);
    if (filing.filedAt.getTime() >= shortCutoff) short.push(...flags);
  }
  return { short: [...new Set(short)], long: [...new Set(long)] };
}

