import { describe, expect, it } from "vitest";
import { utcDate, isoDay, addDays, isWeekend } from "@/lib/dates";
import {
  pickRebalanceDays,
  runBacktest,
  type BacktestInputs,
  type BacktestParams,
} from "@/lib/backtest/engine";

/**
 * Synthetic fixture with hand-computable prices:
 *  - UP grows ~0.1%/day, DOWN shrinks, FLAT stays 100.
 *  - Benchmark grows 0.05%/day.
 * ranksAt always prefers UP then FLAT then DOWN.
 */
function buildInputs(days: Date[]): BacktestInputs {
  const prices = new Map<string, Map<string, number>>();
  const benchmark = new Map<string, number>();
  const tickers: Record<string, (i: number) => number> = {
    UP: (i) => 100 * Math.pow(1.001, i),
    FLAT: () => 100,
    DOWN: (i) => 100 * Math.pow(0.999, i),
  };
  for (const [ticker, fn] of Object.entries(tickers)) {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(isoDay(d), fn(i)));
    prices.set(ticker, m);
  }
  days.forEach((d, i) => benchmark.set(isoDay(d), 100 * Math.pow(1.0005, i)));

  return {
    tradingDays: days,
    prices,
    benchmark,
    ranksAt: () => [
      { ticker: "UP", score: 90 },
      { ticker: "FLAT", score: 60 },
      { ticker: "DOWN", score: 30 },
    ],
  };
}

function weekdays(start: Date, count: number): Date[] {
  const out: Date[] = [];
  let d = start;
  while (out.length < count) {
    if (!isWeekend(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

const DAYS = weekdays(utcDate(2025, 1, 6), 130); // ~6 months of weekdays

const BASE: BacktestParams = {
  strategy: "overall",
  topN: 2,
  rebalance: "monthly",
  txnCostBps: 0,
  start: DAYS[0],
  end: DAYS[DAYS.length - 1],
};

describe("pickRebalanceDays", () => {
  it("selects the first day plus month-ends (monthly)", () => {
    const rebalance = pickRebalanceDays(DAYS, "monthly");
    expect(isoDay(rebalance[0])).toBe(isoDay(DAYS[0]));
    // Every selected day (after the first) is the last trading day of a month.
    for (const day of rebalance.slice(1)) {
      const next = DAYS[DAYS.findIndex((d) => d.getTime() === day.getTime()) + 1];
      expect(next.getUTCMonth()).not.toBe(day.getUTCMonth());
    }
    // ~6 months -> first day + ~5-6 month ends.
    expect(rebalance.length).toBeGreaterThanOrEqual(5);
  });

  it("selects only quarter-ends (quarterly)", () => {
    const rebalance = pickRebalanceDays(DAYS, "quarterly");
    for (const day of rebalance.slice(1)) {
      expect([2, 5, 8, 11]).toContain(day.getUTCMonth()); // Mar/Jun/Sep/Dec
    }
    expect(rebalance.length).toBeLessThan(pickRebalanceDays(DAYS, "monthly").length);
  });
});

describe("runBacktest", () => {
  it("holds the top-N names equal weight and tracks their growth", () => {
    const result = runBacktest(buildInputs(DAYS), BASE);
    // Top 2 = UP + FLAT, equal weight, no costs.
    // Final value = 0.5 x UP_growth + 0.5 x 1.0 (FLAT part is re-equalized
    // monthly, transferring value between them; total return must land
    // between FLAT (0%) and UP (~13.8%) and above benchmark-free half-mix.
    expect(result.points[0].strategy).toBeCloseTo(1, 6);
    const final = result.points.at(-1)!.strategy;
    expect(final).toBeGreaterThan(1.05);
    expect(final).toBeLessThan(1.14);
    expect(result.rebalances[0].tickers).toEqual(["UP", "FLAT"]);
    expect(result.stats.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result.limitations.length).toBeGreaterThan(3);
  });

  it("charges transaction costs that reduce the final value", () => {
    const noCost = runBacktest(buildInputs(DAYS), BASE);
    const withCost = runBacktest(buildInputs(DAYS), { ...BASE, txnCostBps: 50 });
    expect(withCost.points.at(-1)!.strategy).toBeLessThan(
      noCost.points.at(-1)!.strategy,
    );
    // First rebalance trades the whole book: turnover ~1, cost ~50bps.
    expect(withCost.rebalances[0].turnover).toBeCloseTo(1, 2);
    expect(withCost.rebalances[0].costPaid).toBeCloseTo(0.005, 3);
    expect(withCost.stats.totalCostPaid).toBeGreaterThan(0.005);
  });

  it("computes benchmark-relative stats", () => {
    const result = runBacktest(buildInputs(DAYS), BASE);
    // Benchmark: 1.0005^129 - 1 = ~6.66%.
    expect(result.stats.benchmarkTotalReturn).toBeCloseTo(
      Math.pow(1.0005, 129) - 1,
      3,
    );
    expect(result.stats.cagr).not.toBeNull();
    expect(result.stats.volatility).not.toBeNull();
    expect(result.stats.tradingDays).toBe(130);
  });

  it("skips tickers without prices at the rebalance date", () => {
    const inputs = buildInputs(DAYS);
    inputs.ranksAt = () => [
      { ticker: "MISSING", score: 99 },
      { ticker: "UP", score: 90 },
      { ticker: "FLAT", score: 60 },
    ];
    const result = runBacktest(inputs, BASE);
    expect(result.rebalances[0].tickers).toEqual(["UP", "FLAT"]);
  });

  it("rejects windows that are too short", () => {
    expect(() =>
      runBacktest(buildInputs(DAYS.slice(0, 5)), {
        ...BASE,
        start: DAYS[0],
        end: DAYS[4],
      }),
    ).toThrow(/too short/i);
  });
});
