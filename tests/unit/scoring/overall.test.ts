import { describe, expect, it } from "vitest";
import { computeScores, ratingFromScore } from "@/lib/scoring/overall";
import { scoringInput } from "../../helpers/scoring-fixtures";
import type { MetricsResult } from "@/lib/metrics/types";

/** Rich, healthy metrics: every factor available and broadly strong. */
function richMetrics(): Partial<MetricsResult> {
  return {
    pe: 20,
    forwardPe: 18,
    peg: 1.2,
    evToEbitda: 14,
    priceToSales: 5,
    fcfYield: 0.045,
    grossMargin: 0.6,
    operatingMargin: 0.25,
    roe: 0.22,
    roa: 0.12,
    debtToEquity: 0.5,
    netDebtToEbitda: 0.8,
    interestCoverage: 12,
    currentRatio: 1.8,
    revenueGrowthYoY: 0.14,
    revenueCagr3y: 0.12,
    epsGrowthYoY: 0.18,
    forwardGrowth: 0.12,
    epsRevisionTrend: 0.4,
    marginExpansion: 0.015,
    return1m: 0.03,
    relReturn1m: 0.01,
    relReturn3m: 0.04,
    relReturn6m: 0.07,
    relReturn12m: 0.15,
    earningsVolatility: 0.12,
    fcfConsistency: 1,
    sentiment90d: 0.2,
    peHistory: Array.from({ length: 12 }, (_, i) => ({
      date: `2025-${String(i + 1).padStart(2, "0")}-28`,
      pe: 16 + i * 0.5,
    })),
  };
}

describe("ratingFromScore thresholds", () => {
  it("maps scores to bands exactly at the boundaries", () => {
    expect(ratingFromScore(72)).toBe("STRONG_CANDIDATE");
    expect(ratingFromScore(71.99)).toBe("CANDIDATE");
    expect(ratingFromScore(58)).toBe("CANDIDATE");
    expect(ratingFromScore(57.99)).toBe("WATCHLIST");
    expect(ratingFromScore(42)).toBe("WATCHLIST");
    expect(ratingFromScore(41.99)).toBe("AVOID");
    expect(ratingFromScore(0)).toBe("AVOID");
  });
});

describe("computeScores composition", () => {
  it("is internally consistent: overall equals the pillar-weighted mean", () => {
    const breakdown = computeScores(scoringInput(richMetrics()));
    const scored = breakdown.pillars.filter((p) => p.score !== null);
    const wsum = scored.reduce((a, p) => a + p.weight, 0);
    const expected =
      scored.reduce((a, p) => a + p.score! * p.weight, 0) / wsum;
    expect(breakdown.overall).toBeCloseTo(expected, 2);
    expect(breakdown.coverage).toBeGreaterThan(0.95);
    expect(breakdown.overrides).toHaveLength(0);
    // Factor contributions reproduce each pillar score.
    for (const pillar of scored) {
      const availW = pillar.factors
        .filter((f) => f.available)
        .reduce((a, f) => a + f.weight, 0);
      const recomputed =
        pillar.factors
          .filter((f) => f.available)
          .reduce((a, f) => a + f.normalized! * f.weight, 0) / availW;
      expect(pillar.score).toBeCloseTo(recomputed, 2);
    }
  });

  it("reweights the overall score when a pillar has no data", () => {
    // Momentum entirely missing -> its weight is redistributed.
    const noMomentum = scoringInput({
      ...richMetrics(),
      return1m: null,
      relReturn1m: null,
      relReturn3m: null,
      relReturn6m: null,
      relReturn12m: null,
      epsRevisionTrend: null,
    });
    const breakdown = computeScores(noMomentum);
    const momentum = breakdown.pillars.find((p) => p.key === "momentum")!;
    expect(momentum.score).toBeNull();
    expect(momentum.coverage).toBe(0);
    const scored = breakdown.pillars.filter((p) => p.score !== null);
    expect(scored).toHaveLength(4);
    const expected =
      scored.reduce((a, p) => a + p.score! * p.weight, 0) /
      scored.reduce((a, p) => a + p.weight, 0);
    expect(breakdown.overall).toBeCloseTo(expected, 2);
  });

  it("is deterministic", () => {
    const a = computeScores(scoringInput(richMetrics()));
    const b = computeScores(scoringInput(richMetrics()));
    expect(a).toEqual(b);
  });
});

describe("rating overrides", () => {
  it("caps at Watchlist when interest coverage < 1", () => {
    const breakdown = computeScores(
      scoringInput({ ...richMetrics(), interestCoverage: 0.8 }),
    );
    expect(breakdown.overrides.map((o) => o.code)).toContain(
      "INTEREST_COVERAGE_LT_1",
    );
    expect(["WATCHLIST", "AVOID"]).toContain(breakdown.rating);
    expect(breakdown.ratingReason).toMatch(/overrides cap the rating/i);
  });

  it("caps at Watchlist on a non-reliance filing within 180 days", () => {
    const breakdown = computeScores(
      scoringInput(richMetrics(), {
        filingFlags90d: [],
        filingFlags180d: ["ITEM_4_02"],
      }),
    );
    expect(breakdown.overrides.map((o) => o.code)).toContain("NON_RELIANCE_8K");
    expect(["WATCHLIST", "AVOID"]).toContain(breakdown.rating);
  });

  it("forces exactly Watchlist when data coverage is insufficient", () => {
    // Empty metrics: only static factors (tailwind, cyclicality, red flags)
    // are available -> coverage far below the 50% minimum.
    const breakdown = computeScores(scoringInput({}));
    expect(breakdown.coverage).toBeLessThan(0.5);
    expect(breakdown.overrides.map((o) => o.code)).toContain("INSUFFICIENT_DATA");
    // Forced BOTH ways: never AVOID (too strong a claim without data),
    // never CANDIDATE (no evidence).
    expect(breakdown.rating).toBe("WATCHLIST");
  });
});
