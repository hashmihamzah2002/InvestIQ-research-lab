import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importCsv } from "@/lib/pipeline/import-csv";
import { seedUniverse } from "@/lib/pipeline/seed";
import { createTestDb, type TestDb } from "../helpers/test-db";

const template = (name: string): string =>
  readFileSync(join(process.cwd(), "data", "templates", name), "utf8");

describe("CSV import (scratch DB)", () => {
  let tdb: TestDb;

  beforeAll(async () => {
    tdb = createTestDb();
    await seedUniverse(tdb.db);
  }, 60_000);

  afterAll(async () => {
    await tdb.cleanup();
  });

  it("rejects unknown tickers from templates with line-numbered errors", async () => {
    // Templates use the fake TESTCO ticker — not in the fixed universe.
    const result = await importCsv(tdb.db, "prices", "prices.csv", template("prices.csv"));
    expect(result.rowsOk).toBe(0);
    expect(result.rowsFailed).toBe(3);
    expect(result.errors[0].message).toMatch(/not in the research universe/);
    // The job is recorded either way.
    expect(await tdb.db.importJob.count()).toBe(1);
  });

  it("imports prices for a real universe ticker, idempotently", async () => {
    const csv = [
      "ticker,date,open,high,low,close,adjClose,volume",
      "AAPL,2019-06-10,100,102,99,101,101,1000000",
      "AAPL,2019-06-11,101,103,100,102.5,102.5,900000",
      "aapl,2019-06-12,102.5,104,101,103,,",
      "AAPL,not-a-date,1,1,1,1,1,1",
    ].join("\n");

    const result = await importCsv(tdb.db, "prices", "aapl.csv", csv);
    expect(result.rowsOk).toBe(3); // lowercase ticker normalized
    expect(result.rowsFailed).toBe(1);
    expect(result.errors[0].line).toBe(5);

    const aapl = await tdb.db.company.findUniqueOrThrow({ where: { ticker: "AAPL" } });
    const bars = await tdb.db.priceBar.findMany({
      where: { companyId: aapl.id, source: "csv" },
      orderBy: { date: "asc" },
    });
    expect(bars).toHaveLength(3);
    expect(bars[2].adjClose).toBe(103); // empty adjClose falls back to close

    // Re-import: upserts, no duplicates.
    await importCsv(tdb.db, "prices", "aapl.csv", csv);
    expect(
      await tdb.db.priceBar.count({ where: { companyId: aapl.id, source: "csv" } }),
    ).toBe(3);
  });

  it("imports filings with red flags (the sanctioned red-flag demo path)", async () => {
    const csv = [
      "ticker,accessionNo,form,filedAt,title,url,flags",
      "INTC,test-import-nt-1,NT 10-Q,2026-05-12,Late filing notification,https://example.com/nt,LATE_FILING",
    ].join("\n");
    const result = await importCsv(tdb.db, "filings", "flags.csv", csv);
    expect(result.rowsOk).toBe(1);

    const intc = await tdb.db.company.findUniqueOrThrow({ where: { ticker: "INTC" } });
    const filing = await tdb.db.filing.findFirstOrThrow({
      where: { companyId: intc.id, source: "csv" },
    });
    expect(filing.flagsJson).toContain("LATE_FILING");
  });

  it("imports macro series, creating unknown indicators on the fly", async () => {
    const result = await importCsv(tdb.db, "macro", "macro.csv", template("macro.csv"));
    expect(result.rowsOk).toBe(3);
    const custom = await tdb.db.macroIndicator.findUnique({
      where: { seriesId: "CUSTOM_SERIES" },
    });
    expect(custom).not.toBeNull();
    expect(
      await tdb.db.macroObservation.count({ where: { indicatorId: custom!.id } }),
    ).toBe(1);
  });

  it("imports fundamentals rows for universe tickers", async () => {
    const csv = [
      "ticker,periodEnd,periodType,revenue,grossProfit,operatingIncome,netIncome,eps,sharesOut,totalAssets,totalLiabilities,totalEquity,cash,totalDebt,currentAssets,currentLiabilities,ebitda,operatingCashFlow,capex,dividendsPaid,interestExpense,reportedAt",
      "MSFT,2019-12-31,QUARTERLY,36900000000,24500000000,13900000000,11600000000,1.51,7600000000,282800000000,170200000000,112600000000,134300000000,63300000000,159900000000,67500000000,16000000000,10700000000,3500000000,3900000000,650000000,2020-01-29",
    ].join("\n");
    const result = await importCsv(tdb.db, "fundamentals", "msft.csv", csv);
    expect(result.rowsOk).toBe(1);
    expect(result.rowsFailed).toBe(0);

    const msft = await tdb.db.company.findUniqueOrThrow({ where: { ticker: "MSFT" } });
    const period = await tdb.db.fundamentalsPeriod.findFirstOrThrow({
      where: { companyId: msft.id, source: "csv" },
    });
    expect(period.revenue).toBe(36_900_000_000);
    expect(period.reportedAt?.toISOString().slice(0, 10)).toBe("2020-01-29");
  });
});
