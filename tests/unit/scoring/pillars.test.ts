import { describe, expect, it } from "vitest";
import { FACTOR_WEIGHTS, PILLAR_WEIGHTS } from "@/lib/scoring/constants";
import { scoreGrowth } from "@/lib/scoring/growth";
import { scoreMomentum } from "@/lib/scoring/momentum";
import { scoreQuality } from "@/lib/scoring/quality";
import { scoreRisk } from "@/lib/scoring/risk";
import { scoreValuation } from "@/lib/scoring/valuation";
import { scoringInput } from "../../helpers/scoring-fixtures";

describe("model weights integrity", () => {
  it("pillar weights sum to 1", () => {
    const sum = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("factor weights sum to 1 within every pillar", () => {
    for (const [pillar, weights] of Object.entries(FACTOR_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum, `${pillar} weights`).toBeCloseTo(1, 10);
    }
  });
});

describe("valuation pillar (hand-computed)", () => {
  it("scores P/E vs sector via anchor interpolation", () => {
    // pe 20 / median 25 = 0.8 -> 76.67 (see normalize.test.ts).
    const pillar = scoreValuation(scoringInput({ pe: 20 }));
    const factor = pillar.factors.find((f) => f.key === "pe_vs_sector")!;
    expect(factor.rawValue).toBe(0.8);
    expect(factor.normalized).toBe(76.67);
  });

  it("scores FCF yield on absolute anchors", () => {
    const pillar = scoreValuation(scoringInput({ fcfYield: 0.035 }));
    const factor = pillar.factors.find((f) => f.key === "fcf_yield")!;
    expect(factor.normalized).toBe(60);
  });

  it("computes growth-adjusted P/S with clamping", () => {
    // P/S 6 / growth 30% -> 6/30 = 0.2 -> between (0.15,80) and (0.3,60): 73.33.
    const pillar = scoreValuation(
      scoringInput({ priceToSales: 6, revenueGrowthYoY: 0.3 }),
    );
    const factor = pillar.factors.find((f) => f.key === "ps_growth_adjusted")!;
    expect(factor.rawValue).toBeCloseTo(0.2, 10);
    expect(factor.normalized).toBe(73.33);
  });

  it("reweights around unavailable factors and reports coverage", () => {
    // Only P/E available: coverage = 0.2 -> below MIN_PILLAR_COVERAGE -> null.
    const sparse = scoreValuation(scoringInput({ pe: 20 }));
    expect(sparse.coverage).toBeCloseTo(0.2, 10);
    expect(sparse.score).toBeNull();

    // P/E + FCF yield + fwd P/E available: coverage 0.6, score = weighted mean.
    const richer = scoreValuation(
      scoringInput({ pe: 20, fcfYield: 0.035, forwardPe: 22 }),
    );
    // fwd 22 / median 22 = 1.0 -> 60.
    expect(richer.coverage).toBeCloseTo(0.6, 10);
    const expected = (76.67 * 0.2 + 60 * 0.2 + 60 * 0.2) / 0.6;
    expect(richer.score).toBeCloseTo(expected, 2);
  });
});

describe("quality pillar", () => {
  it("scores gross margin as a sector percentile", () => {
    // 0.55 within [0.3,0.45,0.55,0.65,0.7]: below=2, equal=1 -> rank 3 -> 50.
    const pillar = scoreQuality(scoringInput({ grossMargin: 0.55 }));
    const factor = pillar.factors.find((f) => f.key === "gross_margin")!;
    expect(factor.normalized).toBe(50);
  });

  it("falls back to ROA scoring when equity is negative", () => {
    const pillar = scoreQuality(scoringInput({ roe: null, roa: 0.12 }));
    const factor = pillar.factors.find((f) => f.key === "roe")!;
    expect(factor.normalized).toBe(85); // ROA_ANCHORS at 0.12
    expect(factor.note).toMatch(/ROA/);
  });

  it("uses current ratio for balance sheet when EBITDA is unusable", () => {
    const pillar = scoreQuality(
      scoringInput({ netDebtToEbitda: null, currentRatio: 2 }),
    );
    const factor = pillar.factors.find((f) => f.key === "balance_sheet")!;
    expect(factor.normalized).toBe(80);
    expect(factor.note).toMatch(/current ratio/i);
  });

  it("marks bank-style inputs unavailable instead of guessing", () => {
    const pillar = scoreQuality(scoringInput({ grossMargin: null }));
    const factor = pillar.factors.find((f) => f.key === "gross_margin")!;
    expect(factor.available).toBe(false);
    expect(factor.note).toMatch(/banks/i);
  });
});

describe("growth pillar", () => {
  it("scores revenue growth and the static tailwind assumption", () => {
    const pillar = scoreGrowth(scoringInput({ revenueGrowthYoY: 0.15 }));
    const rev = pillar.factors.find((f) => f.key === "revenue_growth")!;
    // 0.15 between (0.1,60) and (0.2,80) -> 70.
    expect(rev.normalized).toBe(70);

    const tailwind = pillar.factors.find((f) => f.key === "industry_tailwind")!;
    expect(tailwind.normalized).toBe(80); // Software per INDUSTRY_TAILWINDS
    expect(tailwind.note).toMatch(/assumption/i);
  });
});

describe("momentum pillar", () => {
  it("computes 12m-ex-1m from relative returns", () => {
    const pillar = scoreMomentum(
      scoringInput({ relReturn12m: 0.2, relReturn1m: 0.05, return1m: 0.02 }),
    );
    const factor = pillar.factors.find((f) => f.key === "rel_return_12m_ex_1m")!;
    expect(factor.rawValue).toBeCloseTo(0.15, 10);
    // 0.15 between (0.1,70) and (0.35,90): 70 + 20*(0.05/0.25) = 74.
    expect(factor.normalized).toBe(74);
  });

  it("reweights when revision data is missing", () => {
    const pillar = scoreMomentum(
      scoringInput({
        relReturn3m: 0.025, // -> 62.5
        relReturn6m: 0, // -> 55
        relReturn12m: 0.1,
        relReturn1m: 0.1, // ex-1m = 0 -> 55
        return1m: 0, // -> 55
      }),
    );
    expect(pillar.coverage).toBeCloseTo(0.9, 10);
    const expected =
      (62.5 * 0.25 + 55 * 0.3 + 55 * 0.2 + 55 * 0.15) / 0.9;
    expect(pillar.score).toBeCloseTo(expected, 2);
  });
});

describe("risk pillar (safety orientation)", () => {
  it("scores leverage and coverage on anchors", () => {
    const pillar = scoreRisk(
      scoringInput({ debtToEquity: 0.6, interestCoverage: 8 }),
    );
    expect(pillar.factors.find((f) => f.key === "debt_to_equity")!.normalized).toBe(72);
    expect(pillar.factors.find((f) => f.key === "interest_coverage")!.normalized).toBe(80);
  });

  it("treats debt-free companies as strong coverage with a note", () => {
    const pillar = scoreRisk(
      scoringInput({ debtToEquity: 0.05, interestCoverage: null }),
    );
    const factor = pillar.factors.find((f) => f.key === "interest_coverage")!;
    expect(factor.normalized).toBe(90);
    expect(factor.note).toMatch(/minimal debt/i);
  });

  it("blends own-history and sector percentiles for compression risk", () => {
    const peHistory = Array.from({ length: 12 }, (_, i) => ({
      date: `2025-${String(i + 1).padStart(2, "0")}-28`,
      pe: 10 + i, // 10..21
    }));
    const pillar = scoreRisk(
      scoringInput(
        { pe: 20, peHistory },
        { sectorContext: { ...scoringInput().sectorContext, pes: [15, 20, 25] } },
      ),
    );
    const factor = pillar.factors.find((f) => f.key === "valuation_compression")!;
    // own pctl 87.5 (x0.6) + sector pctl 50 (x0.4) = 72.5 -> anchors -> 37.
    expect(factor.rawValue).toBe(72.5);
    expect(factor.normalized).toBe(37);
  });

  it("applies red-flag penalties with floor", () => {
    const flagged = scoreRisk(
      scoringInput({}, { filingFlags90d: ["LATE_FILING"] }),
    );
    expect(flagged.factors.find((f) => f.key === "red_flags")!.normalized).toBe(60); // 85-25

    const pileup = scoreRisk(
      scoringInput(
        { sentiment90d: -0.5 },
        { filingFlags90d: ["ITEM_4_02", "LATE_FILING", "AUDITOR_CHANGE"] },
      ),
    );
    // 85 - 40 - 25 - 20 - 15 = -15 -> floored at 5.
    expect(pileup.factors.find((f) => f.key === "red_flags")!.normalized).toBe(5);
  });

  it("uses the static cyclicality assumption per sector", () => {
    const staples = scoreRisk(
      scoringInput({}, { sector: "Consumer Staples" }),
    );
    expect(
      staples.factors.find((f) => f.key === "sector_cyclicality")!.normalized,
    ).toBe(85);
  });
});
