import {
  EPS_GROWTH_ANCHORS,
  FACTOR_WEIGHTS,
  INDUSTRY_TAILWINDS,
  INDUSTRY_TAILWIND_DEFAULT,
  MARGIN_EXPANSION_ANCHORS,
  REVENUE_GROWTH_ANCHORS,
} from "./constants";
import { buildPillar, makeFactor } from "./factor";
import type { PillarScore, ScoringInput } from "./types";

export function scoreGrowth(input: ScoringInput): PillarScore {
  const m = input.metrics;
  const W = FACTOR_WEIGHTS.growth;
  const tailwind = INDUSTRY_TAILWINDS[input.industry] ?? INDUSTRY_TAILWIND_DEFAULT;

  const factors = [
    makeFactor({
      key: "revenue_growth",
      label: "Revenue growth (YoY)",
      pillar: "growth",
      weight: W.revenue_growth,
      rawValue: m.revenueGrowthYoY,
      rawUnit: "pct",
      anchors: REVENUE_GROWTH_ANCHORS,
      note:
        m.revenueGrowthYoY === null
          ? "Unavailable: needs 8 quarters of revenue."
          : "TTM revenue vs the prior TTM.",
    }),
    makeFactor({
      key: "revenue_cagr_3y",
      label: "Revenue CAGR (3y)",
      pillar: "growth",
      weight: W.revenue_cagr_3y,
      rawValue: m.revenueCagr3y,
      rawUnit: "pct",
      anchors: REVENUE_GROWTH_ANCHORS,
      note:
        m.revenueCagr3y === null
          ? "Unavailable: needs 4 years of quarterly revenue."
          : "Compound annual growth over three years — smooths one-off swings.",
    }),
    makeFactor({
      key: "eps_growth",
      label: "EPS growth (YoY)",
      pillar: "growth",
      weight: W.eps_growth,
      rawValue: m.epsGrowthYoY,
      rawUnit: "pct",
      anchors: EPS_GROWTH_ANCHORS,
      note:
        m.epsGrowthYoY === null
          ? "Unavailable: needs positive prior-year EPS as a base."
          : "TTM diluted EPS vs the prior TTM.",
    }),
    makeFactor({
      key: "forward_growth",
      label: "Forward growth estimate",
      pillar: "growth",
      weight: W.forward_growth,
      rawValue: m.forwardGrowth,
      rawUnit: "pct",
      anchors: REVENUE_GROWTH_ANCHORS,
      note:
        m.forwardGrowth === null
          ? "Unavailable: no provider estimate configured."
          : "Provider estimate of next-twelve-month growth — an input, not a fact.",
    }),
    makeFactor({
      key: "margin_expansion",
      label: "Margin expansion",
      pillar: "growth",
      weight: W.margin_expansion,
      rawValue: m.marginExpansion,
      rawUnit: "pp",
      anchors: MARGIN_EXPANSION_ANCHORS,
      note:
        m.marginExpansion === null
          ? "Unavailable: needs two years of quarterly operating income."
          : "TTM operating margin minus the prior year's TTM operating margin.",
    }),
    makeFactor({
      key: "industry_tailwind",
      label: "Industry tailwind",
      pillar: "growth",
      weight: W.industry_tailwind,
      rawValue: tailwind,
      rawUnit: "score",
      normalized: tailwind,
      note: `Static model assumption for "${input.industry}" (see Methodology — curated map, not market data).`,
    }),
  ];

  return buildPillar("growth", factors);
}
