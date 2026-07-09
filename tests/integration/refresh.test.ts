import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { StepResultsSchema, type RefreshSummary } from "@/lib/pipeline/types";
import { parseJsonColumnStrict } from "@/lib/db/json";
import { runRefresh } from "@/lib/pipeline/refresh";
import { seedUniverse } from "@/lib/pipeline/seed";
import { macroStep } from "@/lib/pipeline/steps";
import { createTestDb, type TestDb } from "../helpers/test-db";

const ASOF = utcDate(2026, 6, 10);

describe("refresh pipeline (scratch SQLite, mock chain)", () => {
  let tdb: TestDb;
  let first: RefreshSummary;

  beforeAll(async () => {
    tdb = createTestDb();
    const seeded = await seedUniverse(tdb.db);
    expect(seeded.companies).toBe(31);
    first = await runRefresh({ trigger: "SEED", asOf: ASOF, db: tdb.db });
  }, 120_000);

  afterAll(async () => {
    await tdb.cleanup();
  });

  it("completes fully on the mock chain and populates every table", async () => {
    expect(first.status).toBe("SUCCESS");
    const db = tdb.db;

    expect(await db.company.count()).toBe(31);
    expect(await db.priceBar.count()).toBeGreaterThan(45_000);
    expect(await db.fundamentalsPeriod.count()).toBeGreaterThan(700);
    expect(await db.keyMetricsSnapshot.count()).toBe(30);
    expect(await db.filing.count()).toBeGreaterThan(800);
    expect(await db.newsItem.count()).toBeGreaterThan(300);
    expect(await db.macroObservation.count()).toBeGreaterThan(400);
    expect(await db.macroIndicator.count()).toBe(7);

    // Index proxy has prices but no fundamentals/filings/news.
    const spy = await db.company.findUniqueOrThrow({ where: { ticker: "SPY" } });
    expect(await db.priceBar.count({ where: { companyId: spy.id } })).toBeGreaterThan(1500);
    expect(await db.fundamentalsPeriod.count({ where: { companyId: spy.id } })).toBe(0);
    expect(await db.filing.count({ where: { companyId: spy.id } })).toBe(0);

    // COIN history starts at its IPO date.
    const coin = await db.company.findUniqueOrThrow({ where: { ticker: "COIN" } });
    const firstCoinBar = await db.priceBar.findFirstOrThrow({
      where: { companyId: coin.id },
      orderBy: { date: "asc" },
    });
    expect(firstCoinBar.date.getTime()).toBeGreaterThanOrEqual(
      utcDate(2021, 4, 14).getTime(),
    );

    // Everything is labeled with its source.
    expect(await db.priceBar.count({ where: { source: "mock" } })).toBe(
      await db.priceBar.count(),
    );
  });

  it("persists an UpdateRun with parseable per-step results", async () => {
    const run = await tdb.db.updateRun.findFirstOrThrow({
      orderBy: { startedAt: "desc" },
    });
    expect(run.status).toBe("SUCCESS");
    expect(run.finishedAt).toBeTruthy();
    const steps = parseJsonColumnStrict(StepResultsSchema, run.stepsJson, "steps");
    expect(steps.map((s) => s.name)).toEqual([
      "macro",
      "prices",
      "fundamentals",
      "filings",
      "news",
      "metrics",
      "scores",
      "maintenance",
    ]);
    const fetchSteps = steps.slice(0, 5);
    for (const step of fetchSteps) {
      expect(step.status).toBe("SUCCESS");
      expect(step.providers).toEqual(["mock"]);
      expect(step.items).toBeGreaterThan(0);
    }
    expect(steps.every((s) => s.status === "SUCCESS")).toBe(true);
    // Mock served everything (healthy); csv legitimately failed first in the
    // chain (no import files present) and its failures are tracked.
    const health = await tdb.db.providerHealth.findMany();
    const mockRows = health.filter((h) => h.provider === "mock");
    expect(mockRows.length).toBeGreaterThan(0);
    expect(mockRows.every((h) => h.consecutiveFailures === 0 && h.lastSuccessAt)).toBe(true);
    const csvRows = health.filter((h) => h.provider === "csv");
    expect(csvRows.every((h) => h.consecutiveFailures > 0)).toBe(true);
  });

  it("is idempotent — re-running the same day adds no duplicate rows", async () => {
    const before = {
      bars: await tdb.db.priceBar.count(),
      fundamentals: await tdb.db.fundamentalsPeriod.count(),
      filings: await tdb.db.filing.count(),
      news: await tdb.db.newsItem.count(),
      macro: await tdb.db.macroObservation.count(),
    };
    const second = await runRefresh({ trigger: "MANUAL", asOf: ASOF, db: tdb.db });
    expect(second.status).toBe("SUCCESS");
    expect(await tdb.db.priceBar.count()).toBe(before.bars);
    expect(await tdb.db.fundamentalsPeriod.count()).toBe(before.fundamentals);
    expect(await tdb.db.filing.count()).toBe(before.filings);
    expect(await tdb.db.newsItem.count()).toBe(before.news);
    expect(await tdb.db.macroObservation.count()).toBe(before.macro);

    const pricesStepResult = second.steps.find((s) => s.name === "prices")!;
    expect(pricesStepResult.items).toBe(0);
  }, 120_000);

  it("marks the run PARTIAL when one step crashes, without hurting others", async () => {
    const boomStep = {
      name: "boom",
      run: async () => {
        throw new Error("injected failure");
      },
    };
    const summary = await runRefresh({
      trigger: "MANUAL",
      asOf: ASOF,
      db: tdb.db,
      pipeline: [macroStep, boomStep],
    });
    expect(summary.status).toBe("PARTIAL");
    expect(summary.steps.find((s) => s.name === "macro")!.status).toBe("SUCCESS");
    const boom = summary.steps.find((s) => s.name === "boom")!;
    expect(boom.status).toBe("FAILED");
    expect(boom.errors[0]).toContain("injected failure");
  });

  it("honors the ticker filter for per-company steps", async () => {
    const scratch = createTestDb();
    try {
      await seedUniverse(scratch.db);
      const summary = await runRefresh({
        trigger: "MANUAL",
        asOf: ASOF,
        db: scratch.db,
        tickers: ["AAPL"],
        steps: ["prices"],
      });
      expect(summary.status).toBe("SUCCESS");
      const withBars = await scratch.db.company.findMany({
        where: { priceBars: { some: {} } },
        select: { ticker: true },
      });
      // AAPL plus the index proxy (always refreshed for relative strength).
      expect(new Set(withBars.map((c) => c.ticker))).toEqual(
        new Set(["AAPL", "SPY"]),
      );
      const skipped = summary.steps.filter((s) => s.status === "SKIPPED");
      expect(skipped.map((s) => s.name)).toEqual([
        "macro",
        "fundamentals",
        "filings",
        "news",
        "metrics",
        "scores",
        "maintenance",
      ]);
    } finally {
      await scratch.cleanup();
    }
  }, 120_000);
});
