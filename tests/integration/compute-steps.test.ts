import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { parseJsonColumnStrict } from "@/lib/db/json";
import { runRefresh } from "@/lib/pipeline/refresh";
import { ScorePayloadSchema } from "@/lib/pipeline/score-payload";
import { seedUniverse } from "@/lib/pipeline/seed";
import { createTestDb, type TestDb } from "../helpers/test-db";
import type { RefreshSummary } from "@/lib/pipeline/types";

const ASOF = utcDate(2026, 6, 10);

describe("full pipeline: fetch -> metrics -> scores -> ranks (scratch DB)", () => {
  let tdb: TestDb;
  let summary: RefreshSummary;

  beforeAll(async () => {
    tdb = createTestDb();
    await seedUniverse(tdb.db);
    summary = await runRefresh({ trigger: "SEED", asOf: ASOF, db: tdb.db });
  }, 180_000);

  afterAll(async () => {
    await tdb.cleanup();
  });

  it("runs all steps to SUCCESS including the compute stages", () => {
    expect(summary.status).toBe("SUCCESS");
    const names = summary.steps.map((s) => s.name);
    expect(names).toEqual([
      "macro",
      "prices",
      "fundamentals",
      "filings",
      "news",
      "metrics",
      "scores",
      "maintenance",
    ]);
    expect(summary.steps.find((s) => s.name === "metrics")!.items).toBe(30);
    expect(summary.steps.find((s) => s.name === "scores")!.items).toBe(30);
  });

  it("persists 30 metric snapshots with provenance and P/E history", async () => {
    const snapshots = await tdb.db.metricSnapshot.findMany({ where: { asOf: ASOF } });
    expect(snapshots).toHaveLength(30);
    for (const s of snapshots.slice(0, 5)) {
      expect(s.dataQualityJson).toBeTruthy();
      expect(s.peHistoryJson).toBeTruthy();
      expect(s.marketCap).not.toBeNull();
    }
  });

  it("persists 30 score snapshots with unique ranks and parseable payloads", async () => {
    const scores = await tdb.db.scoreSnapshot.findMany({
      where: { date: ASOF },
      orderBy: { rank: "asc" },
    });
    expect(scores).toHaveLength(30);

    const ranks = scores.map((s) => s.rank);
    expect(new Set(ranks).size).toBe(30);
    expect(ranks[0]).toBe(1);
    expect(ranks[29]).toBe(30);
    // Rank 1 has the highest overall score.
    expect(scores[0].overallScore).toBe(
      Math.max(...scores.map((s) => s.overallScore)),
    );

    const payload = parseJsonColumnStrict(
      ScorePayloadSchema,
      scores[0].breakdownJson,
      "score payload",
    );
    expect(payload.breakdown.pillars).toHaveLength(5);
    expect(payload.narrative.bullCase.length).toBeGreaterThan(0);
    expect(payload.breakdown.rating).toBe(scores[0].rating);

    // Sector ranks start at 1 within each sector.
    const sectorRanks = new Map<string, number[]>();
    for (const s of scores) {
      const company = await tdb.db.company.findUniqueOrThrow({
        where: { id: s.companyId },
        select: { sector: true },
      });
      sectorRanks.set(company.sector, [
        ...(sectorRanks.get(company.sector) ?? []),
        s.sectorRank!,
      ]);
    }
    for (const [sector, list] of sectorRanks) {
      const sorted = [...list].sort((a, b) => a - b);
      expect(sorted[0], `${sector} starts at rank 1`).toBe(1);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("spreads ratings across bands on the persisted snapshots", async () => {
    const scores = await tdb.db.scoreSnapshot.findMany({ where: { date: ASOF } });
    const ratings = new Set(scores.map((s) => s.rating));
    expect(ratings.size).toBeGreaterThanOrEqual(3);
  });

  it("re-running the compute steps is idempotent (upserts, same counts)", async () => {
    const again = await runRefresh({
      trigger: "MANUAL",
      asOf: ASOF,
      db: tdb.db,
      steps: ["metrics", "scores"],
    });
    expect(again.status).toBe("SUCCESS");
    expect(await tdb.db.metricSnapshot.count({ where: { asOf: ASOF } })).toBe(30);
    expect(await tdb.db.scoreSnapshot.count({ where: { date: ASOF } })).toBe(30);
  }, 120_000);

  it("keeps sector comparisons universe-wide when a ticker filter is used", async () => {
    const filtered = await runRefresh({
      trigger: "MANUAL",
      asOf: ASOF,
      db: tdb.db,
      tickers: ["AAPL"],
      steps: ["scores"],
    });
    expect(filtered.status).toBe("SUCCESS");
    // Every company still has a rank (full re-rank across stored snapshots).
    const ranked = await tdb.db.scoreSnapshot.count({
      where: { date: ASOF, rank: { not: null } },
    });
    expect(ranked).toBe(30);
  }, 120_000);
});
