import { describe, expect, it } from "vitest";
import { FmpProvider } from "@/lib/providers/fmp";
import { ProviderError } from "@/lib/providers/types";
import { fakeFetch } from "../../helpers/fake-fetch";
import { makeCtx } from "../../helpers/provider-ctx";

const ENV = { FMP_API_KEY: "test-key" };
const company = { ticker: "TESTCO" };

describe("FmpProvider", () => {
  it("merges statements and normalizes negative cash-flow conventions", async () => {
    const { fetchImpl } = fakeFetch([
      {
        match: /income-statement.*period=annual/,
        body: [
          { date: "2025-12-31", revenue: 40e9, grossProfit: 20e9, operatingIncome: 8e9, netIncome: 6e9, epsdiluted: 6, weightedAverageShsOutDil: 1e9, ebitda: 10e9, interestExpense: 0.54e9 },
        ],
      },
      { match: /income-statement.*period=quarter/, body: [
          { date: "2026-03-31", revenue: 10.5e9, netIncome: 1.6e9, epsdiluted: 1.6 },
        ] },
      {
        match: /balance-sheet-statement.*period=annual/,
        body: [
          { date: "2025-12-31", totalAssets: 60e9, totalLiabilities: 35e9, totalStockholdersEquity: 25e9, cashAndCashEquivalents: 8e9, totalDebt: 12e9, totalCurrentAssets: 15e9, totalCurrentLiabilities: 9e9 },
        ],
      },
      { match: /balance-sheet-statement.*period=quarter/, body: [] },
      {
        match: /cash-flow-statement.*period=annual/,
        body: [
          { date: "2025-12-31", operatingCashFlow: 9e9, capitalExpenditure: -2e9, dividendsPaid: -1.8e9 },
        ],
      },
      { match: /cash-flow-statement.*period=quarter/, body: [] },
    ]);
    const provider = new FmpProvider({ fetchImpl });
    const rows = await provider.getStatements(company, makeCtx(ENV));

    const annual = rows.find((r) => r.periodType === "ANNUAL")!;
    expect(annual.revenue).toBe(40e9);
    expect(annual.capex).toBe(2e9); // abs()
    expect(annual.dividendsPaid).toBe(1.8e9); // abs()
    expect(annual.totalDebt).toBe(12e9);

    const quarter = rows.find((r) => r.periodType === "QUARTERLY")!;
    expect(quarter.netIncome).toBe(1.6e9);
  });

  it("maps ratios-ttm to key metrics", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "ratios-ttm", body: [{ dividendYieldTTM: 0.012, pegRatioTTM: 1.8 }] },
    ]);
    const provider = new FmpProvider({ fetchImpl });
    const km = await provider.getKeyMetrics(company, makeCtx(ENV));
    expect(km.dividendYield).toBe(0.012);
  });

  it("treats Error Message bodies as provider failure", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "financialmodelingprep", body: { "Error Message": "Limit reached" } },
    ]);
    const provider = new FmpProvider({ fetchImpl });
    await expect(provider.getStatements(company, makeCtx(ENV))).rejects.toThrow(
      ProviderError,
    );
  });
});
