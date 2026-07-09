import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { toJsonColumn } from "@/lib/db/json";
import {
  FilingRowSchema,
  FundamentalsRowSchema,
  MacroRowSchema,
  NewsRowSchema,
  PriceRowSchema,
  parseCsv,
} from "@/lib/providers/csv/schemas";
import { log } from "@/lib/logging/logger";
import { upsertFilings, upsertFundamentals, upsertNews } from "./store";

/**
 * Admin CSV import: parse -> per-row validation -> idempotent upserts ->
 * ImportJob record. Unknown tickers are row errors (the universe is fixed);
 * unknown macro seriesIds create a new indicator.
 */
export type ImportKind = "prices" | "fundamentals" | "filings" | "news" | "macro";

export interface ImportResult {
  kind: ImportKind;
  filename: string;
  rowsOk: number;
  rowsFailed: number;
  errors: { line: number; message: string }[];
}

const SOURCE = "csv";

export async function importCsv(
  db: PrismaClient,
  kind: ImportKind,
  filename: string,
  text: string,
): Promise<ImportResult> {
  const errors: { line: number; message: string }[] = [];
  let rowsOk = 0;

  const companies = await db.company.findMany({
    select: { id: true, ticker: true, isIndex: true },
  });
  const companyByTicker = new Map(companies.map((c) => [c.ticker, c]));

  const requireCompany = (ticker: string, line: number): string | null => {
    const company = companyByTicker.get(ticker);
    if (!company) {
      errors.push({
        line,
        message: `${ticker}: not in the research universe (fixed 30-company list + SPY)`,
      });
      return null;
    }
    return company.id;
  };

  switch (kind) {
    case "prices": {
      const parsed = parseCsv(text, PriceRowSchema);
      errors.push(...parsed.errors);
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      parsed.rows.forEach((row, idx) => {
        const companyId = requireCompany(row.ticker, idx + 2);
        if (!companyId) return;
        ops.push(
          db.priceBar.upsert({
            where: { companyId_date: { companyId, date: row.date } },
            create: {
              companyId,
              date: row.date,
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              adjClose: row.adjClose ?? row.close,
              volume: row.volume ?? 0,
              source: SOURCE,
            },
            update: {
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              adjClose: row.adjClose ?? row.close,
              volume: row.volume ?? 0,
              source: SOURCE,
            },
          }),
        );
        rowsOk++;
      });
      for (let i = 0; i < ops.length; i += 200) {
        await db.$transaction(ops.slice(i, i + 200));
      }
      break;
    }

    case "fundamentals": {
      const parsed = parseCsv(text, FundamentalsRowSchema);
      errors.push(...parsed.errors);
      const byCompany = new Map<string, typeof parsed.rows>();
      parsed.rows.forEach((row, idx) => {
        const companyId = requireCompany(row.ticker, idx + 2);
        if (!companyId) return;
        byCompany.set(companyId, [...(byCompany.get(companyId) ?? []), row]);
      });
      for (const [companyId, rows] of byCompany) {
        rowsOk += await upsertFundamentals(
          db,
          companyId,
          rows.map((r) => ({
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
          })),
          SOURCE,
        );
      }
      break;
    }

    case "filings": {
      const parsed = parseCsv(text, FilingRowSchema);
      errors.push(...parsed.errors);
      const byCompany = new Map<string, typeof parsed.rows>();
      parsed.rows.forEach((row, idx) => {
        const companyId = requireCompany(row.ticker, idx + 2);
        if (!companyId) return;
        byCompany.set(companyId, [...(byCompany.get(companyId) ?? []), row]);
      });
      for (const [companyId, rows] of byCompany) {
        rowsOk += await upsertFilings(
          db,
          companyId,
          rows.map((r) => ({
            accessionNo: r.accessionNo,
            form: r.form,
            filedAt: r.filedAt,
            title: r.title,
            url: r.url,
            flags: r.flags,
          })),
          SOURCE,
        );
      }
      break;
    }

    case "news": {
      const parsed = parseCsv(text, NewsRowSchema);
      errors.push(...parsed.errors);
      const byCompany = new Map<string, typeof parsed.rows>();
      parsed.rows.forEach((row, idx) => {
        const companyId = requireCompany(row.ticker, idx + 2);
        if (!companyId) return;
        byCompany.set(companyId, [...(byCompany.get(companyId) ?? []), row]);
      });
      for (const [companyId, rows] of byCompany) {
        rowsOk += await upsertNews(
          db,
          companyId,
          rows.map((r) => ({
            publishedAt: r.publishedAt,
            title: r.title,
            url: r.url,
            source: r.source,
            summary: r.summary,
            sentiment: r.sentiment,
          })),
          SOURCE,
        );
      }
      break;
    }

    case "macro": {
      const parsed = parseCsv(text, MacroRowSchema);
      errors.push(...parsed.errors);
      const bySeries = new Map<string, typeof parsed.rows>();
      for (const row of parsed.rows) {
        bySeries.set(row.seriesId, [...(bySeries.get(row.seriesId) ?? []), row]);
      }
      for (const [seriesId, rows] of bySeries) {
        const indicator = await db.macroIndicator.upsert({
          where: { seriesId },
          create: { seriesId, name: seriesId, unit: "custom" },
          update: {},
        });
        const ops = rows.map((r) =>
          db.macroObservation.upsert({
            where: { indicatorId_date: { indicatorId: indicator.id, date: r.date } },
            create: { indicatorId: indicator.id, date: r.date, value: r.value, source: SOURCE },
            update: { value: r.value, source: SOURCE },
          }),
        );
        for (let i = 0; i < ops.length; i += 200) {
          await db.$transaction(ops.slice(i, i + 200));
        }
        rowsOk += rows.length;
      }
      break;
    }
  }

  const result: ImportResult = {
    kind,
    filename,
    rowsOk,
    rowsFailed: errors.length,
    errors: errors.slice(0, 20),
  };

  await db.importJob.create({
    data: {
      kind,
      filename,
      rowsOk: result.rowsOk,
      rowsFailed: result.rowsFailed,
      errorsJson: toJsonColumn(result.errors),
    },
  });
  log.info("csv.import.completed", {
    kind,
    filename,
    rowsOk: result.rowsOk,
    rowsFailed: result.rowsFailed,
  });
  return result;
}
