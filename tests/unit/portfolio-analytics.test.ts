import { describe, expect, it } from "vitest";
import {
  analyzePortfolio,
  PORTFOLIO_THRESHOLDS,
  type PositionInput,
} from "@/lib/portfolio/analytics";

function pos(
  ticker: string,
  weightPct: number,
  sector = "Information Technology",
  scores: Partial<Pick<PositionInput, "valuationScore" | "riskScore" | "overallScore">> = {},
): PositionInput {
  return {
    ticker,
    weightPct,
    sector,
    valuationScore: scores.valuationScore ?? null,
    riskScore: scores.riskScore ?? null,
    overallScore: scores.overallScore ?? null,
  };
}

describe("analyzePortfolio (hand-computed)", () => {
  it("computes allocation, cash, HHI and effective holdings", () => {
    // Two positions 30/30: invested 60, cash 40.
    // HHI over invested = (30/60)^2 + (30/60)^2 = 0.5 -> 2 effective holdings.
    const a = analyzePortfolio([
      pos("AAA", 30, "Financials"),
      pos("BBB", 30, "Energy"),
    ]);
    expect(a.totalWeightPct).toBe(60);
    expect(a.cashPct).toBe(40);
    expect(a.hhi).toBe(0.5);
    expect(a.effectiveHoldings).toBe(2);
    expect(a.maxPosition).toEqual({ ticker: "AAA", weightPct: 30 });
  });

  it("aggregates sector exposure sorted by weight", () => {
    const a = analyzePortfolio([
      pos("AAA", 25, "Financials"),
      pos("BBB", 10, "Energy"),
      pos("CCC", 15, "Financials"),
    ]);
    expect(a.sectorExposure).toEqual([
      { sector: "Financials", weightPct: 40 },
      { sector: "Energy", weightPct: 10 },
    ]);
  });

  it("weights scores by position size, ignoring unscored positions", () => {
    const a = analyzePortfolio([
      pos("AAA", 20, "Financials", { valuationScore: 80, overallScore: 70 }),
      pos("BBB", 10, "Energy", { valuationScore: 20, overallScore: 40 }),
      pos("CCC", 10, "Energy"), // no scores -> excluded from the average
    ]);
    // (80*20 + 20*10) / 30 = 60; (70*20 + 40*10)/30 = 60.
    expect(a.weightedValuationScore).toBe(60);
    expect(a.weightedOverallScore).toBe(60);
    expect(a.weightedRiskScore).toBeNull();
  });

  it("warns exactly at the documented thresholds", () => {
    // 20% is allowed; 20.5% is not.
    const ok = analyzePortfolio([
      pos("AAA", PORTFOLIO_THRESHOLDS.maxPositionPct, "A"),
      pos("B1", 10, "B"), pos("B2", 10, "C"), pos("B3", 10, "D"), pos("B4", 10, "E"),
    ]);
    expect(ok.warnings.map((w) => w.code)).not.toContain("POSITION_CONCENTRATION");

    const concentrated = analyzePortfolio([
      pos("AAA", 20.5, "A"),
      pos("B1", 10, "B"), pos("B2", 10, "C"), pos("B3", 10, "D"), pos("B4", 10, "E"),
    ]);
    expect(concentrated.warnings.map((w) => w.code)).toContain(
      "POSITION_CONCENTRATION",
    );

    // Sector: five 8.5% positions in one sector = 42.5% > 40%.
    const sectorHeavy = analyzePortfolio([
      pos("S1", 8.5), pos("S2", 8.5), pos("S3", 8.5), pos("S4", 8.5), pos("S5", 8.5),
    ]);
    expect(sectorHeavy.warnings.map((w) => w.code)).toContain(
      "SECTOR_CONCENTRATION",
    );
  });

  it("flags overallocation and low diversification", () => {
    const over = analyzePortfolio([pos("AAA", 60, "A"), pos("BBB", 50, "B")]);
    expect(over.warnings.map((w) => w.code)).toContain("OVERALLOCATED");

    const thin = analyzePortfolio([pos("AAA", 10, "A")]);
    expect(thin.warnings.map((w) => w.code)).toContain("LOW_DIVERSIFICATION");
  });

  it("flags weak valuation and low safety books", () => {
    const risky = analyzePortfolio([
      pos("AAA", 10, "A", { valuationScore: 30, riskScore: 30 }),
      pos("BBB", 10, "B", { valuationScore: 35, riskScore: 40 }),
      pos("C1", 10, "C"), pos("C2", 10, "D"), pos("C3", 10, "E"),
    ]);
    const codes = risky.warnings.map((w) => w.code);
    expect(codes).toContain("WEAK_VALUATION");
    expect(codes).toContain("LOW_SAFETY");
  });

  it("handles the empty portfolio", () => {
    const a = analyzePortfolio([]);
    expect(a.totalWeightPct).toBe(0);
    expect(a.cashPct).toBe(100);
    expect(a.hhi).toBeNull();
    expect(a.effectiveHoldings).toBeNull();
    expect(a.warnings).toEqual([]);
  });
});
