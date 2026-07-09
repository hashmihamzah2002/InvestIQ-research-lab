import { z } from "zod";
import type { Env } from "@/lib/config/env";
import {
  ProviderError,
  type CompanyRef,
  type KeyMetricsDTO,
  type FundamentalsProvider,
  type ProviderContext,
  type StatementPeriodDTO,
} from "@/lib/providers/types";
import { CACHE_TTL_MS } from "../cache";
import { fetchJson, type HttpDeps } from "../http";
import { RateLimiter } from "../rate-limiter";

/**
 * Financial Modeling Prep — statements + TTM ratios. Free tier ~250 req/day;
 * the limiter is set well below the per-minute ceiling and the cache absorbs
 * repeats. FMP returns {"Error Message": ...} bodies on quota/plan issues.
 */
const IncomeRow = z.object({
  date: z.string(),
  period: z.string().optional(),
  revenue: z.number().nullish(),
  grossProfit: z.number().nullish(),
  operatingIncome: z.number().nullish(),
  netIncome: z.number().nullish(),
  epsdiluted: z.number().nullish(),
  weightedAverageShsOutDil: z.number().nullish(),
  ebitda: z.number().nullish(),
  interestExpense: z.number().nullish(),
});

const BalanceRow = z.object({
  date: z.string(),
  totalAssets: z.number().nullish(),
  totalLiabilities: z.number().nullish(),
  totalStockholdersEquity: z.number().nullish(),
  cashAndCashEquivalents: z.number().nullish(),
  totalDebt: z.number().nullish(),
  totalCurrentAssets: z.number().nullish(),
  totalCurrentLiabilities: z.number().nullish(),
});

const CashFlowRow = z.object({
  date: z.string(),
  operatingCashFlow: z.number().nullish(),
  capitalExpenditure: z.number().nullish(),
  dividendsPaid: z.number().nullish(),
});

const RatiosTtmRow = z.object({
  dividendYielTTM: z.number().nullish(), // (sic) FMP's actual field name
  dividendYieldTTM: z.number().nullish(),
  pegRatioTTM: z.number().nullish(),
});

export class FmpProvider implements FundamentalsProvider {
  readonly name = "fmp";
  readonly categories = ["fundamentals"] as const;
  private readonly limiter = new RateLimiter(10, 60_000);

  constructor(private readonly deps: HttpDeps = {}) {}

  isConfigured(env: Env): boolean {
    return Boolean(env.FMP_API_KEY);
  }

  private async call(ctx: ProviderContext, path: string): Promise<unknown> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `https://financialmodelingprep.com/api/v3/${path}${sep}apikey=${ctx.env.FMP_API_KEY}`;
    const payload = await fetchJson(
      {
        provider: this.name,
        category: "fundamentals",
        url,
        timeoutMs: ctx.env.HTTP_TIMEOUT_MS,
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: CACHE_TTL_MS.fundamentals,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const message = (payload as Record<string, unknown>)["Error Message"];
      if (typeof message === "string") {
        throw new ProviderError(`fmp: ${message.slice(0, 140)}`, this.name, "fundamentals");
      }
    }
    return payload;
  }

  async getStatements(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<StatementPeriodDTO[]> {
    const sym = encodeURIComponent(company.ticker);
    const [incomeA, incomeQ, balanceA, balanceQ, cashA, cashQ] = await Promise.all([
      this.call(ctx, `income-statement/${sym}?period=annual&limit=8`),
      this.call(ctx, `income-statement/${sym}?period=quarter&limit=24`),
      this.call(ctx, `balance-sheet-statement/${sym}?period=annual&limit=8`),
      this.call(ctx, `balance-sheet-statement/${sym}?period=quarter&limit=24`),
      this.call(ctx, `cash-flow-statement/${sym}?period=annual&limit=8`),
      this.call(ctx, `cash-flow-statement/${sym}?period=quarter&limit=24`),
    ]);

    const periods = new Map<string, StatementPeriodDTO>();
    const ensure = (date: string, type: "ANNUAL" | "QUARTERLY"): StatementPeriodDTO => {
      const key = `${date}:${type}`;
      let p = periods.get(key);
      if (!p) {
        p = { periodEnd: new Date(`${date}T00:00:00.000Z`), periodType: type };
        periods.set(key, p);
      }
      return p;
    };

    const applyArray = <T>(
      payload: unknown,
      schema: z.ZodType<T>,
      type: "ANNUAL" | "QUARTERLY",
      apply: (p: StatementPeriodDTO, row: T) => void,
    ): void => {
      const arr = z.array(z.unknown()).safeParse(payload);
      if (!arr.success) {
        throw new ProviderError("expected array payload", this.name, "fundamentals");
      }
      for (const raw of arr.data) {
        const row = schema.safeParse(raw);
        if (!row.success) continue; // tolerate odd rows, keep valid ones
        const date = (row.data as { date: string }).date;
        apply(ensure(date, type), row.data);
      }
    };

    applyArray(incomeA, IncomeRow, "ANNUAL", assignIncome);
    applyArray(incomeQ, IncomeRow, "QUARTERLY", assignIncome);
    applyArray(balanceA, BalanceRow, "ANNUAL", assignBalance);
    applyArray(balanceQ, BalanceRow, "QUARTERLY", assignBalance);
    applyArray(cashA, CashFlowRow, "ANNUAL", assignCashFlow);
    applyArray(cashQ, CashFlowRow, "QUARTERLY", assignCashFlow);

    const rows = [...periods.values()]
      .filter((p) => p.revenue != null || p.totalAssets != null)
      .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
    if (rows.length === 0) {
      throw new ProviderError(
        `no usable statement periods for ${company.ticker}`,
        this.name,
        "fundamentals",
      );
    }
    return rows;
  }

  async getKeyMetrics(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<KeyMetricsDTO> {
    const payload = await this.call(ctx, `ratios-ttm/${encodeURIComponent(company.ticker)}`);
    const arr = z.array(RatiosTtmRow).safeParse(payload);
    if (!arr.success || arr.data.length === 0) {
      throw new ProviderError("ratios-ttm failed validation", this.name, "fundamentals");
    }
    const row = arr.data[0];
    return {
      forwardPe: null,
      forwardGrowth: null,
      epsRevisionTrend: null,
      dividendYield: row.dividendYieldTTM ?? row.dividendYielTTM ?? null,
    };
  }
}

function assignIncome(p: StatementPeriodDTO, r: z.infer<typeof IncomeRow>): void {
  p.revenue = r.revenue ?? null;
  p.grossProfit = r.grossProfit ?? null;
  p.operatingIncome = r.operatingIncome ?? null;
  p.netIncome = r.netIncome ?? null;
  p.eps = r.epsdiluted ?? null;
  p.sharesOut = r.weightedAverageShsOutDil ?? null;
  p.ebitda = r.ebitda ?? null;
  p.interestExpense = r.interestExpense ?? null;
}

function assignBalance(p: StatementPeriodDTO, r: z.infer<typeof BalanceRow>): void {
  p.totalAssets = r.totalAssets ?? null;
  p.totalLiabilities = r.totalLiabilities ?? null;
  p.totalEquity = r.totalStockholdersEquity ?? null;
  p.cash = r.cashAndCashEquivalents ?? null;
  p.totalDebt = r.totalDebt ?? null;
  p.currentAssets = r.totalCurrentAssets ?? null;
  p.currentLiabilities = r.totalCurrentLiabilities ?? null;
}

function assignCashFlow(p: StatementPeriodDTO, r: z.infer<typeof CashFlowRow>): void {
  p.operatingCashFlow = r.operatingCashFlow ?? null;
  // FMP reports capex and dividends as negative cash flows; store positive.
  p.capex = r.capitalExpenditure != null ? Math.abs(r.capitalExpenditure) : null;
  p.dividendsPaid = r.dividendsPaid != null ? Math.abs(r.dividendsPaid) : null;
}

export const fmpProvider = new FmpProvider();
