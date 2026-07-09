import { describe, expect, it } from "vitest";
import { buildNarrative } from "@/lib/scoring/narrative";
import { computeScores } from "@/lib/scoring/overall";
import { scoringInput } from "../../helpers/scoring-fixtures";
import type { MetricsResult } from "@/lib/metrics/types";

function mixedMetrics(): Partial<MetricsResult> {
  return {
    pe: 55, // 2.2x sector median -> weak valuation
    fcfYield: 0.01,
    priceToSales: 12,
    grossMargin: 0.68,
    operatingMargin: 0.32, // strong quality
    roe: 0.3,
    debtToEquity: 0.3,
    netDebtToEbitda: 0.2,
    interestCoverage: 20,
    currentRatio: 2.5,
    revenueGrowthYoY: 0.22, // strong growth
    epsGrowthYoY: 0.25,
    marginExpansion: 0.02,
    return1m: -0.06, // soft momentum
    relReturn1m: -0.05,
    relReturn3m: -0.09,
    relReturn6m: -0.12,
    relReturn12m: -0.05,
    earningsVolatility: 0.2,
    fcfConsistency: 0.9,
  };
}

describe("buildNarrative", () => {
  const input = scoringInput(mixedMetrics());
  const breakdown = computeScores(input);
  const narrative = buildNarrative(input, breakdown);

  it("produces 1-3 bull and bear points drawn from real factors", () => {
    expect(narrative.bullCase.length).toBeGreaterThanOrEqual(1);
    expect(narrative.bullCase.length).toBeLessThanOrEqual(3);
    expect(narrative.bearCase.length).toBeGreaterThanOrEqual(1);
    expect(narrative.bearCase.length).toBeLessThanOrEqual(3);
    // Strong operating margin should surface as a bull point.
    expect(narrative.bullCase.join(" ")).toMatch(/margin|return on equity|coverage/i);
    // Weak momentum or stretched valuation should surface as a bear point.
    expect(narrative.bearCase.join(" ")).toMatch(/return|P\/E|valuation/i);
  });

  it("frames everything as model output (calibrated language)", () => {
    const all = [
      ...narrative.bullCase,
      ...narrative.bearCase,
      ...narrative.keyRisks,
      ...narrative.changeMyMind,
    ].join(" ");
    expect(all).toMatch(/model|screens/i);
    expect(all).not.toMatch(/guaranteed|will go up|will rise|sure thing/i);
  });

  it("inverts thresholds for 'what would change my mind'", () => {
    const text = narrative.changeMyMind.join(" ");
    // Mentions a concrete rating band and point distance.
    expect(text).toMatch(/Upgrade to|Already in the top rating band/);
    expect(text).toMatch(/Downgrade risk/);
    expect(text).toMatch(/\d+(\.\d+)? point/);
  });

  it("lists overrides and flags under key risks when present", () => {
    const flagged = scoringInput(mixedMetrics(), {
      filingFlags90d: ["LATE_FILING"],
      filingFlags180d: ["LATE_FILING"],
    });
    const b = computeScores(flagged);
    const n = buildNarrative(flagged, b);
    expect(n.keyRisks.join(" ")).toMatch(/LATE_FILING/);
  });

  it("is deterministic", () => {
    const again = buildNarrative(input, computeScores(input));
    expect(again).toEqual(narrative);
  });
});
