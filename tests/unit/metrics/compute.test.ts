import { describe, expect, it } from "vitest";
import { addDays, lastDayOfMonth, utcDate } from "@/lib/dates";
import {
  availableStatements,
  computeMetrics,
  computePeHistory,
  windowReturn,
} from "@/lib/metrics/compute";
import type { MetricsInput, PricePoint, StatementRow } from "@/lib/metrics/types";

const ASOF = utcDate(2026, 6, 10);

function quarter(
  year: number,
  endMonth: 3 | 6 | 9 | 12,
  over: Partial<StatementRow> = {},
): StatementRow {
  const periodEnd = utcDate(year, endMonth, lastDayOfMonth(year, endMonth));
  return {
    periodEnd,
    periodType: "QUARTERLY",
    revenue: null,
    grossProfit: null,
    operatingIncome: null,
    netIncome: null,
    eps: null,
    sharesOut: null,
    totalAssets: null,
    totalLiabilities: null,
    totalEquity: null,
    cash: null,
    totalDebt: null,
    currentAssets: null,
    currentLiabilities: null,
    ebitda: null,
    operatingCashFlow: null,
    capex: null,
    dividendsPaid: null,
    interestExpense: null,
    reportedAt: addDays(periodEnd, 30),
    source: "test",
    ...over,
  };
}

/** Current year of quarters: steady 100-revenue business. */
const CURRENT = { revenue: 100, grossProfit: 50, operatingIncome: 20, netIncome: 15, eps: 1.5, sharesOut: 10, totalAssets: 400, totalLiabilities: 250, totalEquity: 150, cash: 50, totalDebt: 100, currentAssets: 120, currentLiabilities: 60, ebitda: 25, operatingCashFlow: 18, capex: 5, dividendsPaid: 3, interestExpense: 1.25 };
/** Prior year: smaller (revenue 90, om 18%, eps 1.3). */
const PRIOR = { ...CURRENT, revenue: 90, operatingIncome: 16.2, netIncome: 13, eps: 1.3 };

function buildStatements(): StatementRow[] {
  return [
    quarter(2024, 6, PRIOR),
    quarter(2024, 9, PRIOR),
    quarter(2024, 12, PRIOR),
    quarter(2025, 3, PRIOR),
    quarter(2025, 6, CURRENT),
    quarter(2025, 9, CURRENT),
    quarter(2025, 12, CURRENT),
    quarter(2026, 3, CURRENT),
  ];
}

function pricePoint(y: number, m: number, d: number, close: number): PricePoint {
  return { date: utcDate(y, m, d), close };
}

function buildInput(over: Partial<MetricsInput> = {}): MetricsInput {
  return {
    asOf: ASOF,
    prices: [
      pricePoint(2025, 6, 10, 96),
      pricePoint(2025, 12, 10, 100),
      pricePoint(2026, 3, 10, 110),
      pricePoint(2026, 5, 10, 115),
      pricePoint(2026, 6, 10, 120),
    ],
    indexPrices: [
      pricePoint(2025, 6, 10, 192),
      pricePoint(2025, 12, 10, 196),
      pricePoint(2026, 3, 10, 198),
      pricePoint(2026, 5, 10, 200),
      pricePoint(2026, 6, 10, 202),
    ],
    statements: buildStatements(),
    priceSource: "test",
    ...over,
  };
}

describe("computeMetrics — hand-computed expectations", () => {
  const m = computeMetrics(buildInput());

  it("derives TTM valuation metrics", () => {
    expect(m.price).toBe(120);
    expect(m.marketCap).toBe(1200); // 120 x 10 shares
    expect(m.pe).toBe(20); // 120 / (4 x 1.5)
    expect(m.priceToSales).toBe(3); // 1200 / 400
    expect(m.evToEbitda).toBe(12.5); // (1200 + 100 - 50) / 100
    expect(m.fcfYield).toBe(0.0433); // (72 - 20) / 1200
    expect(m.dividendYield).toBe(0.01); // 12 / 1200
    // PEG: pe 20 / (eps growth 15.38%) = 1.3
    expect(m.peg).toBe(1.3);
  });

  it("derives margins and returns on capital", () => {
    expect(m.grossMargin).toBe(0.5);
    expect(m.operatingMargin).toBe(0.2);
    expect(m.netMargin).toBe(0.15);
    expect(m.roe).toBe(0.4); // 60 / avg(150, 150)
    expect(m.roa).toBe(0.15); // 60 / 400
  });

  it("derives leverage and liquidity", () => {
    expect(m.debtToEquity).toBe(0.67);
    expect(m.netDebtToEbitda).toBe(0.5); // (100 - 50) / 100
    expect(m.interestCoverage).toBe(16); // 80 / 5
    expect(m.currentRatio).toBe(2);
  });

  it("derives growth and stability", () => {
    expect(m.revenueGrowthYoY).toBe(0.1111); // 400/360 - 1
    expect(m.epsGrowthYoY).toBe(0.1538); // 6/5.2 - 1
    expect(m.marginExpansion).toBe(0.02); // 0.20 - 0.18
    expect(m.revenueCagr3y).toBeNull(); // needs 16 quarters
    expect(m.fcfConsistency).toBe(1); // all 8 quarters FCF-positive
    expect(m.earningsVolatility).toBe(0); // identical YoY growth each quarter
  });

  it("derives calendar-window and index-relative returns", () => {
    expect(m.return1m).toBe(0.0435); // 120/115 - 1
    expect(m.return3m).toBe(0.0909); // 120/110 - 1
    expect(m.return6m).toBe(0.2); // 120/100 - 1
    expect(m.return12m).toBe(0.25); // 120/96 - 1
    expect(m.relReturn1m).toBe(0.0335); // 0.0435 - (202/200 - 1)
    expect(m.relReturn12m).toBe(0.1979); // 0.25 - (202/192 - 1)
  });

  it("records provenance", () => {
    expect(m.dataQuality.prices?.source).toBe("test");
    expect(m.dataQuality.fundamentals?.quartersAvailable).toBe(8);
    expect(m.dataQuality.fundamentals?.latestPeriodEnd).toBe("2026-03-31");
  });
});

describe("computeMetrics — guards and gating", () => {
  it("excludes statements not yet public at asOf (no look-ahead)", () => {
    const statements = buildStatements();
    // Latest quarter reported AFTER asOf -> must be invisible.
    statements[7] = quarter(2026, 3, {
      ...CURRENT,
      revenue: 999999,
      reportedAt: utcDate(2026, 7, 1),
    });
    const gated = availableStatements(statements, ASOF);
    expect(gated).toHaveLength(7);

    // reportedAt null -> assumed public 45 days after period end.
    statements[7] = quarter(2026, 3, { ...CURRENT, reportedAt: null });
    expect(availableStatements(statements, utcDate(2026, 5, 14))).toHaveLength(7);
    expect(availableStatements(statements, utcDate(2026, 5, 16))).toHaveLength(8);
  });

  it("guards negative equity (ROE null, note recorded, D/E null)", () => {
    const negEq = buildStatements().map((q) => ({ ...q, totalEquity: -50 }));
    const m = computeMetrics(buildInput({ statements: negEq }));
    expect(m.roe).toBeNull();
    expect(m.debtToEquity).toBeNull();
    expect(m.roa).toBe(0.15);
    expect(m.dataQuality.notes.join(" ")).toMatch(/negative or zero book equity/i);
  });

  it("returns nulls with fewer than 4 quarters (no fake TTM)", () => {
    const short = buildStatements().slice(-3);
    const m = computeMetrics(buildInput({ statements: short }));
    expect(m.pe).toBeNull();
    expect(m.grossMargin).toBeNull();
    expect(m.revenueGrowthYoY).toBeNull();
  });

  it("nulls P/E when TTM earnings are negative", () => {
    const lossy = buildStatements().map((q) => ({ ...q, eps: -0.5, netIncome: -5 }));
    const m = computeMetrics(buildInput({ statements: lossy }));
    expect(m.pe).toBeNull();
    expect(m.dataQuality.notes.join(" ")).toMatch(/negative trailing/i);
  });
});

describe("windowReturn", () => {
  const prices = [
    pricePoint(2026, 3, 10, 100),
    pricePoint(2026, 6, 10, 110),
  ];
  it("computes returns with exact-date matches", () => {
    expect(windowReturn(prices, ASOF, 3)).toBeCloseTo(0.1, 10);
  });
  it("refuses stale start bars (gap > 21 days)", () => {
    // 1-month window would need a bar near 2026-05-10; nearest is 2026-03-10.
    expect(windowReturn(prices, ASOF, 1)).toBeNull();
  });
  it("handles empty series", () => {
    expect(windowReturn([], ASOF, 3)).toBeNull();
  });
});

describe("computePeHistory", () => {
  it("builds monthly trailing P/E with as-of EPS knowledge", () => {
    const statements = buildStatements().filter(
      (s) => s.periodType === "QUARTERLY",
    );
    const prices: PricePoint[] = [];
    // Daily-ish grid: 1st and 15th and month-end of each month in 2025-2026.
    for (let y = 2025; y <= 2026; y++) {
      for (let mo = 1; mo <= 12; mo++) {
        const end = utcDate(y, mo, lastDayOfMonth(y, mo));
        if (end.getTime() > ASOF.getTime()) break;
        prices.push(pricePoint(y, mo, 15, 100), {
          date: end,
          close: 100,
        });
      }
    }
    const history = computePeHistory(prices, statements, ASOF, 12);
    expect(history).toHaveLength(12);
    // From mid-2025 onward the TTM EPS is a mix of PRIOR/CURRENT quarters;
    // by 2026-04 (2026Q1 reported 2026-04-30) TTM EPS = 6 -> P/E ~ 16.67.
    const last = history.at(-1)!;
    expect(last.pe).toBeCloseTo(100 / 6, 1);
    // Every point is either null or positive.
    expect(history.every((p) => p.pe === null || p.pe > 0)).toBe(true);
  });
});
