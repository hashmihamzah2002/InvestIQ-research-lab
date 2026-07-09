import { z } from "zod";
import type { Env } from "@/lib/config/env";
import {
  ProviderError,
  type CompanyRef,
  type DateRange,
  type KeyMetricsDTO,
  type FundamentalsProvider,
  type MarketDataProvider,
  type PriceBarDTO,
  type ProviderContext,
  type StatementPeriodDTO,
} from "@/lib/providers/types";
import { CACHE_TTL_MS } from "../cache";
import { fetchJson, type HttpDeps } from "../http";
import { RateLimiter } from "../rate-limiter";

/**
 * Alpha Vantage — prices + statements + overview. Free tier is tiny
 * (~25 requests/day), so this adapter leans hard on the response cache and
 * expects to be rate-limited; the chain falls through when the budget runs
 * out. AV returns HTTP 200 with a "Note"/"Information" body when throttled —
 * treated as a provider failure here.
 */
const num = z.string().transform((s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
});

const DailySeriesSchema = z.object({
  "Time Series (Daily)": z.record(
    z.string(),
    z.object({
      "1. open": num,
      "2. high": num,
      "3. low": num,
      "4. close": num,
      "5. adjusted close": num.optional(),
      "6. volume": num.optional(),
    }),
  ),
});

const ReportEntry = z.record(z.string(), z.string());
const StatementsSchema = z.object({
  annualReports: z.array(ReportEntry).optional(),
  quarterlyReports: z.array(ReportEntry).optional(),
});

const OverviewSchema = z.object({
  ForwardPE: z.string().optional(),
  PEGRatio: z.string().optional(),
  DividendYield: z.string().optional(),
});

function throttleCheck(payload: unknown, provider: string, category: "market-data" | "fundamentals"): void {
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    const notice = o["Note"] ?? o["Information"] ?? o["Error Message"];
    if (typeof notice === "string") {
      throw new ProviderError(`alpha-vantage: ${notice.slice(0, 140)}`, provider, category);
    }
  }
}

function parseNum(raw: string | undefined): number | null {
  if (raw === undefined || raw === "None" || raw === "-" || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export class AlphaVantageProvider implements MarketDataProvider, FundamentalsProvider {
  readonly name = "alpha-vantage";
  readonly categories = ["market-data", "fundamentals"] as const;
  private readonly limiter = new RateLimiter(5, 60_000);

  constructor(private readonly deps: HttpDeps = {}) {}

  isConfigured(env: Env): boolean {
    return Boolean(env.ALPHA_VANTAGE_API_KEY);
  }

  private async call(
    ctx: ProviderContext,
    category: "market-data" | "fundamentals",
    params: string,
    ttl: number,
  ): Promise<unknown> {
    const url = `https://www.alphavantage.co/query?${params}&apikey=${ctx.env.ALPHA_VANTAGE_API_KEY}`;
    const payload = await fetchJson(
      {
        provider: this.name,
        category,
        url,
        timeoutMs: ctx.env.HTTP_TIMEOUT_MS,
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: ttl,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );
    throttleCheck(payload, this.name, category);
    return payload;
  }

  async getDailyPrices(
    company: CompanyRef,
    range: DateRange,
    ctx: ProviderContext,
  ): Promise<PriceBarDTO[]> {
    const payload = await this.call(
      ctx,
      "market-data",
      `function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(company.ticker)}&outputsize=full`,
      CACHE_TTL_MS.prices,
    );
    const parsed = DailySeriesSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `daily series failed validation: ${parsed.error.issues[0]?.message}`,
        this.name,
        "market-data",
      );
    }
    const bars: PriceBarDTO[] = [];
    for (const [iso, row] of Object.entries(parsed.data["Time Series (Daily)"])) {
      const date = new Date(`${iso}T00:00:00.000Z`);
      if (date.getTime() < range.from.getTime() || date.getTime() > range.to.getTime()) {
        continue;
      }
      const open = row["1. open"];
      const high = row["2. high"];
      const low = row["3. low"];
      const close = row["4. close"];
      if (open === null || high === null || low === null || close === null) continue;
      bars.push({
        date,
        open,
        high,
        low,
        close,
        adjClose: row["5. adjusted close"] ?? close,
        volume: row["6. volume"] ?? 0,
      });
    }
    return bars.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async getStatements(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<StatementPeriodDTO[]> {
    const [income, balance, cashflow] = await Promise.all([
      this.call(ctx, "fundamentals", `function=INCOME_STATEMENT&symbol=${company.ticker}`, CACHE_TTL_MS.fundamentals),
      this.call(ctx, "fundamentals", `function=BALANCE_SHEET&symbol=${company.ticker}`, CACHE_TTL_MS.fundamentals),
      this.call(ctx, "fundamentals", `function=CASH_FLOW&symbol=${company.ticker}`, CACHE_TTL_MS.fundamentals),
    ]);

    const periods = new Map<string, StatementPeriodDTO>();
    const ensure = (end: string, type: "ANNUAL" | "QUARTERLY"): StatementPeriodDTO => {
      const key = `${end}:${type}`;
      let p = periods.get(key);
      if (!p) {
        p = { periodEnd: new Date(`${end}T00:00:00.000Z`), periodType: type };
        periods.set(key, p);
      }
      return p;
    };

    const applyReports = (
      payload: unknown,
      apply: (p: StatementPeriodDTO, r: Record<string, string>) => void,
    ): void => {
      const parsed = StatementsSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ProviderError(
          `statements failed validation: ${parsed.error.issues[0]?.message}`,
          this.name,
          "fundamentals",
        );
      }
      for (const r of parsed.data.annualReports ?? []) {
        if (r.fiscalDateEnding) apply(ensure(r.fiscalDateEnding, "ANNUAL"), r);
      }
      for (const r of parsed.data.quarterlyReports ?? []) {
        if (r.fiscalDateEnding) apply(ensure(r.fiscalDateEnding, "QUARTERLY"), r);
      }
    };

    applyReports(income, (p, r) => {
      p.revenue = parseNum(r.totalRevenue);
      p.grossProfit = parseNum(r.grossProfit);
      p.operatingIncome = parseNum(r.operatingIncome);
      p.netIncome = parseNum(r.netIncome);
      p.ebitda = parseNum(r.ebitda);
      p.interestExpense = parseNum(r.interestExpense);
    });
    applyReports(balance, (p, r) => {
      p.totalAssets = parseNum(r.totalAssets);
      p.totalLiabilities = parseNum(r.totalLiabilities);
      p.totalEquity = parseNum(r.totalShareholderEquity);
      p.cash = parseNum(r.cashAndCashEquivalentsAtCarryingValue);
      p.totalDebt = parseNum(r.shortLongTermDebtTotal);
      p.currentAssets = parseNum(r.totalCurrentAssets);
      p.currentLiabilities = parseNum(r.totalCurrentLiabilities);
      p.sharesOut = parseNum(r.commonStockSharesOutstanding);
    });
    applyReports(cashflow, (p, r) => {
      p.operatingCashFlow = parseNum(r.operatingCashflow);
      p.capex = parseNum(r.capitalExpenditures);
      p.dividendsPaid = parseNum(r.dividendPayout);
    });

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
    const payload = await this.call(
      ctx,
      "fundamentals",
      `function=OVERVIEW&symbol=${company.ticker}`,
      CACHE_TTL_MS.fundamentals,
    );
    const parsed = OverviewSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `overview failed validation`,
        this.name,
        "fundamentals",
      );
    }
    return {
      forwardPe: parseNum(parsed.data.ForwardPE),
      dividendYield: parseNum(parsed.data.DividendYield),
      // AV's PEG implies a growth estimate; leave forwardGrowth null rather
      // than back-derive it.
      forwardGrowth: null,
      epsRevisionTrend: null,
    };
  }
}

export const alphaVantageProvider = new AlphaVantageProvider();
