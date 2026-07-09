import { describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { AlphaVantageProvider } from "@/lib/providers/alpha-vantage";
import { ProviderError } from "@/lib/providers/types";
import { fakeFetch } from "../../helpers/fake-fetch";
import { makeCtx } from "../../helpers/provider-ctx";

const ENV = { ALPHA_VANTAGE_API_KEY: "test-key" };
const company = { ticker: "TESTCO" };

const dailyFixture = {
  "Time Series (Daily)": {
    "2026-06-10": { "1. open": "101.0", "2. high": "103.0", "3. low": "100.5", "4. close": "102.0", "5. adjusted close": "101.8", "6. volume": "1200000" },
    "2026-06-09": { "1. open": "100.0", "2. high": "101.5", "3. low": "99.0", "4. close": "101.0", "5. adjusted close": "100.8", "6. volume": "900000" },
    "2026-06-08": { "1. open": "99.0", "2. high": "100.0", "3. low": "98.0", "4. close": "99.5", "5. adjusted close": "99.3", "6. volume": "800000" },
  },
};

describe("AlphaVantageProvider", () => {
  it("maps and sorts the daily series within range", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "TIME_SERIES_DAILY_ADJUSTED", body: dailyFixture },
    ]);
    const provider = new AlphaVantageProvider({ fetchImpl });
    const bars = await provider.getDailyPrices(
      company,
      { from: utcDate(2026, 6, 9), to: utcDate(2026, 6, 10) },
      makeCtx(ENV),
    );
    expect(bars).toHaveLength(2);
    expect(bars[0].date.toISOString().slice(0, 10)).toBe("2026-06-09");
    expect(bars[1].close).toBe(102);
    expect(bars[1].adjClose).toBe(101.8);
  });

  it("treats throttle notices (HTTP 200 + Note) as provider failure", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "alphavantage", body: { Note: "API call frequency is 25 requests per day" } },
    ]);
    const provider = new AlphaVantageProvider({ fetchImpl });
    await expect(
      provider.getDailyPrices(company, { from: utcDate(2026, 6, 1), to: utcDate(2026, 6, 10) }, makeCtx(ENV)),
    ).rejects.toThrow(ProviderError);
  });

  it("merges income/balance/cash statements by fiscal period", async () => {
    const { fetchImpl } = fakeFetch([
      {
        match: "INCOME_STATEMENT",
        body: {
          annualReports: [
            { fiscalDateEnding: "2025-12-31", totalRevenue: "40000000000", grossProfit: "20000000000", operatingIncome: "8000000000", netIncome: "6000000000", ebitda: "10000000000", interestExpense: "540000000" },
          ],
          quarterlyReports: [
            { fiscalDateEnding: "2026-03-31", totalRevenue: "10500000000", grossProfit: "5300000000", operatingIncome: "2150000000", netIncome: "1600000000", ebitda: "None", interestExpense: "135000000" },
          ],
        },
      },
      {
        match: "BALANCE_SHEET",
        body: {
          annualReports: [
            { fiscalDateEnding: "2025-12-31", totalAssets: "60000000000", totalLiabilities: "35000000000", totalShareholderEquity: "25000000000", cashAndCashEquivalentsAtCarryingValue: "8000000000", shortLongTermDebtTotal: "12000000000", totalCurrentAssets: "15000000000", totalCurrentLiabilities: "9000000000", commonStockSharesOutstanding: "1000000000" },
          ],
          quarterlyReports: [],
        },
      },
      {
        match: "CASH_FLOW",
        body: {
          annualReports: [
            { fiscalDateEnding: "2025-12-31", operatingCashflow: "9000000000", capitalExpenditures: "2000000000", dividendPayout: "1800000000" },
          ],
          quarterlyReports: [],
        },
      },
    ]);
    const provider = new AlphaVantageProvider({ fetchImpl });
    const rows = await provider.getStatements(company, makeCtx(ENV));

    const annual = rows.find((r) => r.periodType === "ANNUAL")!;
    expect(annual.revenue).toBe(40_000_000_000);
    expect(annual.totalEquity).toBe(25_000_000_000);
    expect(annual.operatingCashFlow).toBe(9_000_000_000);
    expect(annual.sharesOut).toBe(1_000_000_000);

    const quarter = rows.find((r) => r.periodType === "QUARTERLY")!;
    expect(quarter.revenue).toBe(10_500_000_000);
    expect(quarter.ebitda).toBeNull(); // "None" -> null
  });

  it("maps OVERVIEW to key metrics", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "OVERVIEW", body: { ForwardPE: "25.4", PEGRatio: "2.1", DividendYield: "0.0044" } },
    ]);
    const provider = new AlphaVantageProvider({ fetchImpl });
    const km = await provider.getKeyMetrics(company, makeCtx(ENV));
    expect(km.forwardPe).toBe(25.4);
    expect(km.dividendYield).toBe(0.0044);
  });
});
