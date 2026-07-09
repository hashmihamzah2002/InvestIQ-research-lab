import { addDays, todayUtc, utcDate } from "@/lib/dates";
import { MACRO_CATALOG } from "@/lib/macro/catalog";
import { callWithFallback, resolveChain } from "@/lib/providers/registry";
import type {
  CompanyRef,
  FilingsProvider,
  FundamentalsProvider,
  MacroProvider,
  MarketDataProvider,
  NewsProvider,
} from "@/lib/providers/types";
import type { ProviderCategory } from "@/lib/db/json";
import type { CompanyRow, PipelineStep, StepContext } from "./types";
import {
  insertNewPriceBars,
  latestFilingDate,
  latestMacroDate,
  latestNewsDate,
  latestPriceDate,
  recordProviderHealth,
  upsertFilings,
  upsertFundamentals,
  upsertKeyMetrics,
  upsertMacroObservations,
  upsertNews,
} from "./store";

/**
 * Data-fetch steps. Each iterates its work items, isolating failures per
 * item: one company/series failing is recorded and skipped, never aborting
 * the step, and a failing provider falls through its chain (ending at mock,
 * which cannot fail). P5 appends the compute steps (metrics, scores,
 * snapshot).
 */

const HISTORY_START = utcDate(2020, 1, 1);
const NEWS_LOOKBACK_DAYS = 180;

function toCompanyRef(row: CompanyRow): CompanyRef {
  return {
    ticker: row.ticker,
    cik: row.cik,
    country: row.country,
    sector: row.sector,
    mockProfileJson: row.mockProfileJson,
    isIndex: row.isIndex,
  };
}

function healthRecorder(ctx: StepContext, category: ProviderCategory) {
  return async (attempt: { provider: string; ok: boolean; error?: string }) => {
    await recordProviderHealth(
      ctx.db,
      attempt.provider,
      category,
      attempt.ok,
      attempt.error,
    );
  };
}

function companiesFor(ctx: StepContext, opts?: { includeIndex?: boolean }): CompanyRow[] {
  return ctx.companies.filter((c) => {
    if (c.isIndex && !opts?.includeIndex) return false;
    if (!c.isIndex && ctx.tickerFilter && !ctx.tickerFilter.has(c.ticker)) return false;
    return true;
  });
}

export const macroStep: PipelineStep = {
  name: "macro",
  async run(ctx) {
    const chain = resolveChain("macro", ctx.provider.env) as MacroProvider[];
    const providers = new Set<string>();
    const errors: string[] = [];
    let items = 0;

    for (const series of MACRO_CATALOG) {
      try {
        const indicator = await ctx.db.macroIndicator.upsert({
          where: { seriesId: series.seriesId },
          create: {
            seriesId: series.seriesId,
            name: series.name,
            unit: series.unit,
            description: series.description,
          },
          update: { name: series.name, unit: series.unit, description: series.description },
        });
        const latest = await latestMacroDate(ctx.db, indicator.id);
        const since = latest ? addDays(latest, 1) : HISTORY_START;
        if (since.getTime() > ctx.provider.asOf.getTime()) continue;

        const result = await callWithFallback(
          chain,
          "macro",
          (p) => p.getSeries(series.seriesId, since, ctx.provider),
          healthRecorder(ctx, "macro"),
        );
        providers.add(result.provider);
        items += await upsertMacroObservations(
          ctx.db,
          indicator.id,
          result.value,
          result.provider,
        );
      } catch (err) {
        errors.push(
          `${series.seriesId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { items, errors, providers };
  },
};

export const pricesStep: PipelineStep = {
  name: "prices",
  async run(ctx) {
    const chain = resolveChain("market-data", ctx.provider.env) as MarketDataProvider[];
    const providers = new Set<string>();
    const errors: string[] = [];
    let items = 0;

    for (const company of companiesFor(ctx, { includeIndex: true })) {
      try {
        const latest = await latestPriceDate(ctx.db, company.id);
        const from = latest ? addDays(latest, 1) : HISTORY_START;
        if (from.getTime() > ctx.provider.asOf.getTime()) continue;

        const result = await callWithFallback(
          chain,
          "market-data",
          (p) =>
            p.getDailyPrices(
              toCompanyRef(company),
              { from, to: ctx.provider.asOf },
              ctx.provider,
            ),
          healthRecorder(ctx, "market-data"),
        );
        providers.add(result.provider);
        items += await insertNewPriceBars(
          ctx.db,
          company.id,
          result.value,
          result.provider,
        );
      } catch (err) {
        errors.push(
          `${company.ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { items, errors, providers };
  },
};

export const fundamentalsStep: PipelineStep = {
  name: "fundamentals",
  async run(ctx) {
    const chain = resolveChain(
      "fundamentals",
      ctx.provider.env,
    ) as FundamentalsProvider[];
    const providers = new Set<string>();
    const errors: string[] = [];
    let items = 0;

    for (const company of companiesFor(ctx)) {
      const ref = toCompanyRef(company);
      try {
        const statements = await callWithFallback(
          chain,
          "fundamentals",
          (p) => p.getStatements(ref, ctx.provider),
          healthRecorder(ctx, "fundamentals"),
        );
        providers.add(statements.provider);
        items += await upsertFundamentals(
          ctx.db,
          company.id,
          statements.value,
          statements.provider,
        );

        // Forward-looking estimates are optional per provider.
        const withKeyMetrics = chain.filter((p) => p.getKeyMetrics);
        if (withKeyMetrics.length > 0) {
          const km = await callWithFallback(
            withKeyMetrics,
            "fundamentals",
            (p) => p.getKeyMetrics!(ref, ctx.provider),
            healthRecorder(ctx, "fundamentals"),
          );
          providers.add(km.provider);
          items += await upsertKeyMetrics(
            ctx.db,
            company.id,
            ctx.provider.asOf,
            km.value,
            km.provider,
          );
        }
      } catch (err) {
        errors.push(
          `${company.ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { items, errors, providers };
  },
};

export const filingsStep: PipelineStep = {
  name: "filings",
  async run(ctx) {
    const chain = resolveChain("filings", ctx.provider.env) as FilingsProvider[];
    const providers = new Set<string>();
    const errors: string[] = [];
    let items = 0;

    for (const company of companiesFor(ctx)) {
      try {
        const latest = await latestFilingDate(ctx.db, company.id);
        const since = latest ? addDays(latest, 1) : HISTORY_START;
        const result = await callWithFallback(
          chain,
          "filings",
          (p) => p.getRecentFilings(toCompanyRef(company), since, ctx.provider),
          healthRecorder(ctx, "filings"),
        );
        providers.add(result.provider);
        items += await upsertFilings(ctx.db, company.id, result.value, result.provider);
      } catch (err) {
        errors.push(
          `${company.ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { items, errors, providers };
  },
};

export const newsStep: PipelineStep = {
  name: "news",
  async run(ctx) {
    const chain = resolveChain("news", ctx.provider.env) as NewsProvider[];
    const providers = new Set<string>();
    const errors: string[] = [];
    let items = 0;

    for (const company of companiesFor(ctx)) {
      try {
        const latest = await latestNewsDate(ctx.db, company.id);
        const since = latest
          ? addDays(latest, 1)
          : addDays(todayUtc(ctx.provider.asOf), -NEWS_LOOKBACK_DAYS);
        if (since.getTime() > ctx.provider.asOf.getTime()) continue;
        const result = await callWithFallback(
          chain,
          "news",
          (p) => p.getCompanyNews(toCompanyRef(company), since, ctx.provider),
          healthRecorder(ctx, "news"),
        );
        providers.add(result.provider);
        items += await upsertNews(ctx.db, company.id, result.value, result.provider);
      } catch (err) {
        errors.push(
          `${company.ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { items, errors, providers };
  },
};

/** Fetch steps in execution order. P5 appends metrics/scores/snapshot. */
export const FETCH_STEPS: PipelineStep[] = [
  macroStep,
  pricesStep,
  fundamentalsStep,
  filingsStep,
  newsStep,
];
