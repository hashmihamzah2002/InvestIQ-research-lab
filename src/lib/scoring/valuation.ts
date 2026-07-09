import {
  FACTOR_WEIGHTS,
  FCF_YIELD_ANCHORS,
  PEG_ANCHORS,
  PS_GROWTH_ADJ_ANCHORS,
  PS_GROWTH_CLAMP,
  RATIO_VS_MEDIAN_ANCHORS,
} from "./constants";
import { clamp } from "./normalize";
import { buildPillar, makeFactor } from "./factor";
import type { PillarScore, ScoringInput } from "./types";

export function scoreValuation(input: ScoringInput): PillarScore {
  const m = input.metrics;
  const sc = input.sectorContext;
  const W = FACTOR_WEIGHTS.valuation;
  const groupNote =
    sc.groupSource === "universe"
      ? `Compared to universe median — only ${sc.groupSize} peers in ${sc.sector}.`
      : `Compared to ${sc.sector} median (${sc.groupSize} companies).`;

  const peRatio =
    m.pe !== null && sc.medianPe !== null && sc.medianPe > 0
      ? m.pe / sc.medianPe
      : null;
  const fwdPeRatio =
    m.forwardPe !== null && sc.medianForwardPe !== null && sc.medianForwardPe > 0
      ? m.forwardPe / sc.medianForwardPe
      : null;
  const evRatio =
    m.evToEbitda !== null &&
    sc.medianEvToEbitda !== null &&
    sc.medianEvToEbitda > 0
      ? m.evToEbitda / sc.medianEvToEbitda
      : null;

  const growthPctRaw = m.revenueGrowthYoY ?? m.revenueCagr3y;
  const psGrowthAdj =
    m.priceToSales !== null && growthPctRaw !== null
      ? m.priceToSales /
        clamp(growthPctRaw * 100, PS_GROWTH_CLAMP.min, PS_GROWTH_CLAMP.max)
      : null;

  const factors = [
    makeFactor({
      key: "pe_vs_sector",
      label: "P/E vs sector median",
      pillar: "valuation",
      weight: W.pe_vs_sector,
      rawValue: peRatio,
      rawUnit: "x-median",
      anchors: RATIO_VS_MEDIAN_ANCHORS,
      note:
        peRatio === null
          ? m.pe === null
            ? "Unavailable: no positive trailing earnings or no price."
            : "Unavailable: no sector median."
          : groupNote,
    }),
    makeFactor({
      key: "forward_pe_vs_sector",
      label: "Forward P/E vs sector median",
      pillar: "valuation",
      weight: W.forward_pe_vs_sector,
      rawValue: fwdPeRatio,
      rawUnit: "x-median",
      anchors: RATIO_VS_MEDIAN_ANCHORS,
      note:
        fwdPeRatio === null
          ? "Unavailable: forward estimates require a fundamentals provider that supplies them."
          : `${groupNote} Forward P/E uses provider estimates of next-twelve-month earnings.`,
    }),
    makeFactor({
      key: "peg",
      label: "PEG ratio",
      pillar: "valuation",
      weight: W.peg,
      rawValue: m.peg,
      rawUnit: "ratio",
      anchors: PEG_ANCHORS,
      note:
        m.peg === null
          ? "Unavailable: needs a positive P/E and positive earnings growth."
          : "P/E divided by earnings growth (forward estimate when available, else trailing).",
    }),
    makeFactor({
      key: "ev_ebitda_vs_sector",
      label: "EV/EBITDA vs sector median",
      pillar: "valuation",
      weight: W.ev_ebitda_vs_sector,
      rawValue: evRatio,
      rawUnit: "x-median",
      anchors: RATIO_VS_MEDIAN_ANCHORS,
      note:
        evRatio === null
          ? "Unavailable: needs positive EBITDA, debt and cash data."
          : groupNote,
    }),
    makeFactor({
      key: "fcf_yield",
      label: "Free cash flow yield",
      pillar: "valuation",
      weight: W.fcf_yield,
      rawValue: m.fcfYield,
      rawUnit: "pct",
      anchors: FCF_YIELD_ANCHORS,
      note:
        m.fcfYield === null
          ? "Unavailable: needs a year of cash-flow statements and market cap."
          : "TTM (operating cash flow − capex) / market cap.",
    }),
    makeFactor({
      key: "ps_growth_adjusted",
      label: "P/S (growth-adjusted)",
      pillar: "valuation",
      weight: W.ps_growth_adjusted,
      rawValue: psGrowthAdj,
      rawUnit: "ratio",
      anchors: PS_GROWTH_ADJ_ANCHORS,
      note:
        psGrowthAdj === null
          ? "Unavailable: needs price-to-sales and revenue growth."
          : `Price/sales divided by revenue growth %, growth clamped to ${PS_GROWTH_CLAMP.min}-${PS_GROWTH_CLAMP.max}. Rewards growth priced cheaply.`,
    }),
  ];

  return buildPillar("valuation", factors);
}
