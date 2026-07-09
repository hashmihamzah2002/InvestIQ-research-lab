import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { runBacktestFromDb } from "@/lib/queries/backtest-runner";
import { runRefresh } from "@/lib/pipeline/refresh";
import { seedUniverse } from "@/lib/pipeline/seed";
import { createTestDb, type TestDb } from "../helpers/test-db";

/**
 * End-to-end: seed + mock refresh a scratch DB, then run a short quarterly
 * backtest through the real runner (as-of scoring, forward-filled prices).
 */
describe("backtest runner (scratch DB)", () => {
  let tdb: TestDb;

  beforeAll(async () => {
    tdb = createTestDb();
    await seedUniverse(tdb.db);
    // Only the data the backtester needs — skip scores/metrics/news steps.
    await runRefresh({
      trigger: "SEED",
      asOf: utcDate(2026, 6, 10),
      db: tdb.db,
      steps: ["prices", "fundamentals", "filings"],
    });
  }, 180_000);

  afterAll(async () => {
    await tdb.cleanup();
  });

  it("runs a quarterly overall-score backtest without look-ahead crashes", async () => {
    const result = await runBacktestFromDb(
      {
        strategy: "overall",
        topN: 5,
        rebalance: "quarterly",
        txnCostBps: 10,
        start: utcDate(2025, 6, 1),
        end: utcDate(2026, 6, 1),
      },
      tdb.db,
    );

    expect(result.points.length).toBeGreaterThan(200); // ~1y of weekdays
    // Day one is the initial rebalance: value = 1.0 minus the 10bps buy cost.
    expect(result.points[0].strategy).toBeGreaterThan(0.998);
    expect(result.points[0].strategy).toBeLessThanOrEqual(1);
    expect(result.rebalances.length).toBeGreaterThanOrEqual(4);
    for (const r of result.rebalances) {
      expect(r.tickers.length).toBe(5);
    }
    // Stats are finite and the benchmark came along.
    expect(Number.isFinite(result.stats.totalReturn)).toBe(true);
    expect(Number.isFinite(result.stats.benchmarkTotalReturn)).toBe(true);
    expect(result.stats.totalCostPaid).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(3);
  }, 120_000);

  it("produces different books for different strategies", async () => {
    const params = {
      topN: 5,
      rebalance: "quarterly" as const,
      txnCostBps: 0,
      start: utcDate(2025, 9, 1),
      end: utcDate(2026, 3, 1),
    };
    const valuation = await runBacktestFromDb(
      { ...params, strategy: "valuation" },
      tdb.db,
    );
    const momentum = await runBacktestFromDb(
      { ...params, strategy: "momentum" },
      tdb.db,
    );
    expect(valuation.rebalances[0].tickers).not.toEqual(
      momentum.rebalances[0].tickers,
    );
  }, 120_000);
});
