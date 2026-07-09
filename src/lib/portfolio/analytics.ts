/**
 * Pure portfolio analytics for the hypothetical (paper) portfolio. Weights
 * are percentages of the whole portfolio; anything unallocated is cash.
 * No brokerage linkage anywhere — these are educational what-if numbers.
 */

export const PORTFOLIO_THRESHOLDS = {
  /** Warn when a single position exceeds this share of the portfolio. */
  maxPositionPct: 20,
  /** Warn when a sector exceeds this share. */
  maxSectorPct: 40,
  /** Educational nudge below this many holdings. */
  minHoldings: 5,
  /** Warn when the weighted valuation score is below this. */
  weakValuationScore: 40,
  /** Warn when the weighted risk (safety) score is below this. */
  lowSafetyScore: 45,
} as const;

export interface PositionInput {
  ticker: string;
  weightPct: number; // 0..100, share of the whole portfolio
  sector: string;
  valuationScore: number | null;
  riskScore: number | null;
  overallScore: number | null;
}

export interface PortfolioWarning {
  code:
    | "OVERALLOCATED"
    | "POSITION_CONCENTRATION"
    | "SECTOR_CONCENTRATION"
    | "LOW_DIVERSIFICATION"
    | "WEAK_VALUATION"
    | "LOW_SAFETY";
  message: string;
}

export interface PortfolioAnalytics {
  totalWeightPct: number;
  cashPct: number;
  /** Herfindahl index over invested weights (0..1); null when nothing invested. */
  hhi: number | null;
  /** 1/HHI — "how many equally-sized holdings this concentration equals". */
  effectiveHoldings: number | null;
  maxPosition: { ticker: string; weightPct: number } | null;
  sectorExposure: { sector: string; weightPct: number }[];
  weightedValuationScore: number | null;
  weightedOverallScore: number | null;
  weightedRiskScore: number | null;
  warnings: PortfolioWarning[];
}

export function analyzePortfolio(positions: PositionInput[]): PortfolioAnalytics {
  const invested = positions.filter((p) => p.weightPct > 0);
  const totalWeightPct = round2(invested.reduce((a, p) => a + p.weightPct, 0));
  const cashPct = round2(Math.max(0, 100 - totalWeightPct));

  // HHI over invested weights normalized to the invested total.
  let hhi: number | null = null;
  if (totalWeightPct > 0) {
    hhi = round4(
      invested.reduce((acc, p) => acc + (p.weightPct / totalWeightPct) ** 2, 0),
    );
  }

  const maxPosition =
    invested.length > 0
      ? invested.reduce((a, b) => (b.weightPct > a.weightPct ? b : a))
      : null;

  const sectorMap = new Map<string, number>();
  for (const p of invested) {
    sectorMap.set(p.sector, (sectorMap.get(p.sector) ?? 0) + p.weightPct);
  }
  const sectorExposure = [...sectorMap.entries()]
    .map(([sector, weightPct]) => ({ sector, weightPct: round2(weightPct) }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const weighted = (f: (p: PositionInput) => number | null): number | null => {
    const scored = invested.filter((p) => f(p) !== null);
    const w = scored.reduce((a, p) => a + p.weightPct, 0);
    if (w <= 0) return null;
    return round2(scored.reduce((a, p) => a + f(p)! * p.weightPct, 0) / w);
  };
  const weightedValuationScore = weighted((p) => p.valuationScore);
  const weightedOverallScore = weighted((p) => p.overallScore);
  const weightedRiskScore = weighted((p) => p.riskScore);

  // --- Warnings ---
  const warnings: PortfolioWarning[] = [];
  if (totalWeightPct > 100.01) {
    warnings.push({
      code: "OVERALLOCATED",
      message: `Allocations sum to ${totalWeightPct.toFixed(1)}% — more than 100% of the hypothetical portfolio. Reduce weights.`,
    });
  }
  for (const p of invested) {
    if (p.weightPct > PORTFOLIO_THRESHOLDS.maxPositionPct) {
      warnings.push({
        code: "POSITION_CONCENTRATION",
        message: `${p.ticker} is ${p.weightPct.toFixed(1)}% of the portfolio — above the ${PORTFOLIO_THRESHOLDS.maxPositionPct}% concentration guideline. A single-stock setback would dominate results.`,
      });
    }
  }
  for (const s of sectorExposure) {
    if (s.weightPct > PORTFOLIO_THRESHOLDS.maxSectorPct) {
      warnings.push({
        code: "SECTOR_CONCENTRATION",
        message: `${s.sector} is ${s.weightPct.toFixed(1)}% of the portfolio — above the ${PORTFOLIO_THRESHOLDS.maxSectorPct}% sector guideline. Sector-wide drawdowns would hit most of the book at once.`,
      });
    }
  }
  if (invested.length > 0 && invested.length < PORTFOLIO_THRESHOLDS.minHoldings) {
    warnings.push({
      code: "LOW_DIVERSIFICATION",
      message: `Only ${invested.length} holding${invested.length === 1 ? "" : "s"} — diversification benefits build meaningfully up to roughly 15-20 names.`,
    });
  }
  if (
    weightedValuationScore !== null &&
    weightedValuationScore < PORTFOLIO_THRESHOLDS.weakValuationScore
  ) {
    warnings.push({
      code: "WEAK_VALUATION",
      message: `Weight-averaged valuation score is ${weightedValuationScore.toFixed(0)}/100 — the model scores this book as expensive relative to its anchors.`,
    });
  }
  if (
    weightedRiskScore !== null &&
    weightedRiskScore < PORTFOLIO_THRESHOLDS.lowSafetyScore
  ) {
    warnings.push({
      code: "LOW_SAFETY",
      message: `Weight-averaged risk (safety) score is ${weightedRiskScore.toFixed(0)}/100 — the model flags elevated aggregate risk.`,
    });
  }

  return {
    totalWeightPct,
    cashPct,
    hhi,
    effectiveHoldings: hhi !== null && hhi > 0 ? round2(1 / hhi) : null,
    maxPosition: maxPosition
      ? { ticker: maxPosition.ticker, weightPct: maxPosition.weightPct }
      : null,
    sectorExposure,
    weightedValuationScore,
    weightedOverallScore,
    weightedRiskScore,
    warnings,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
