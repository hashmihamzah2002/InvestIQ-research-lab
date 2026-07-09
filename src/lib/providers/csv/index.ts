import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ProviderError,
  type CompanyRef,
  type DateRange,
  type FilingDTO,
  type FilingsProvider,
  type FundamentalsProvider,
  type MacroObservationDTO,
  type MacroProvider,
  type MarketDataProvider,
  type NewsItemDTO,
  type NewsProvider,
  type PriceBarDTO,
  type ProviderContext,
  type StatementPeriodDTO,
} from "@/lib/providers/types";
import type { ProviderCategory } from "@/lib/db/json";
import {
  FilingRowSchema,
  FundamentalsRowSchema,
  MacroRowSchema,
  NewsRowSchema,
  PriceRowSchema,
  parseCsv,
} from "./schemas";

/**
 * Manual CSV import provider. Reads data/imports/{category}.csv (headers
 * documented in data/templates/). Semantics matter for chain fallback:
 * "file missing or no rows for this ticker/series" is a ProviderError (fall
 * through to the next adapter); "rows exist but none in the requested
 * window" returns an empty array (a real answer).
 */
const FILE_NAMES: Record<string, string> = {
  prices: "prices.csv",
  fundamentals: "fundamentals.csv",
  filings: "filings.csv",
  news: "news.csv",
  macro: "macro.csv",
};

export class CsvProvider
  implements
    MarketDataProvider,
    FundamentalsProvider,
    FilingsProvider,
    NewsProvider,
    MacroProvider
{
  readonly name = "csv";
  readonly categories = [
    "market-data",
    "fundamentals",
    "filings",
    "news",
    "macro",
  ] as const;

  constructor(private readonly importDir?: string) {}

  isConfigured(): boolean {
    return true; // file presence is checked per call
  }

  private dir(): string {
    return this.importDir ?? join(process.cwd(), "data", "imports");
  }

  private readRows<T>(
    kind: keyof typeof FILE_NAMES,
    schema: Parameters<typeof parseCsv<T>>[1],
    category: ProviderCategory,
    ctx: ProviderContext,
  ): T[] {
    const path = join(this.dir(), FILE_NAMES[kind]);
    if (!existsSync(path)) {
      throw new ProviderError(`no ${FILE_NAMES[kind]} in import folder`, this.name, category);
    }
    const { rows, errors } = parseCsv<T>(readFileSync(path, "utf8"), schema);
    if (errors.length > 0) {
      ctx.log.warn("csv.rows_skipped", {
        file: FILE_NAMES[kind],
        skipped: errors.length,
        firstError: `line ${errors[0].line}: ${errors[0].message}`,
      });
    }
    return rows;
  }

  async getDailyPrices(
    company: CompanyRef,
    range: DateRange,
    ctx: ProviderContext,
  ): Promise<PriceBarDTO[]> {
    const rows = this.readRows("prices", PriceRowSchema, "market-data", ctx).filter(
      (r) => r.ticker === company.ticker.toUpperCase(),
    );
    if (rows.length === 0) {
      throw new ProviderError(
        `no CSV price rows for ${company.ticker}`,
        this.name,
        "market-data",
      );
    }
    return rows
      .filter(
        (r) =>
          r.date.getTime() >= range.from.getTime() &&
          r.date.getTime() <= range.to.getTime(),
      )
      .map((r) => ({
        date: r.date,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        adjClose: r.adjClose ?? r.close,
        volume: r.volume ?? 0,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async getStatements(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<StatementPeriodDTO[]> {
    const rows = this.readRows(
      "fundamentals",
      FundamentalsRowSchema,
      "fundamentals",
      ctx,
    ).filter((r) => r.ticker === company.ticker.toUpperCase());
    if (rows.length === 0) {
      throw new ProviderError(
        `no CSV fundamentals rows for ${company.ticker}`,
        this.name,
        "fundamentals",
      );
    }
    return rows
      .map((r) => ({
        periodEnd: r.periodEnd,
        periodType: r.periodType,
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
      }))
      .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  }

  async getRecentFilings(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<FilingDTO[]> {
    const rows = this.readRows("filings", FilingRowSchema, "filings", ctx).filter(
      (r) => r.ticker === company.ticker.toUpperCase(),
    );
    if (rows.length === 0) {
      throw new ProviderError(
        `no CSV filing rows for ${company.ticker}`,
        this.name,
        "filings",
      );
    }
    return rows
      .filter(
        (r) =>
          r.filedAt.getTime() >= since.getTime() &&
          r.filedAt.getTime() <= ctx.asOf.getTime(),
      )
      .map((r) => ({
        accessionNo: r.accessionNo,
        form: r.form,
        filedAt: r.filedAt,
        title: r.title,
        url: r.url,
        flags: r.flags,
      }));
  }

  async getCompanyNews(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<NewsItemDTO[]> {
    const rows = this.readRows("news", NewsRowSchema, "news", ctx).filter(
      (r) => r.ticker === company.ticker.toUpperCase(),
    );
    if (rows.length === 0) {
      throw new ProviderError(
        `no CSV news rows for ${company.ticker}`,
        this.name,
        "news",
      );
    }
    return rows
      .filter(
        (r) =>
          r.publishedAt.getTime() >= since.getTime() &&
          r.publishedAt.getTime() <= ctx.asOf.getTime(),
      )
      .map((r) => ({
        publishedAt: r.publishedAt,
        title: r.title,
        url: r.url,
        source: r.source,
        summary: r.summary,
        sentiment: r.sentiment,
      }));
  }

  async getSeries(
    seriesId: string,
    since: Date,
    ctx: ProviderContext,
  ): Promise<MacroObservationDTO[]> {
    const rows = this.readRows("macro", MacroRowSchema, "macro", ctx).filter(
      (r) => r.seriesId === seriesId.toUpperCase(),
    );
    if (rows.length === 0) {
      throw new ProviderError(`no CSV macro rows for ${seriesId}`, this.name, "macro");
    }
    return rows
      .filter(
        (r) =>
          r.date.getTime() >= since.getTime() &&
          r.date.getTime() <= ctx.asOf.getTime(),
      )
      .map((r) => ({ date: r.date, value: r.value }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}

export const csvProvider = new CsvProvider();
