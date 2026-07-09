import {
  CURRENT_RATIO_ANCHORS,
  EARNINGS_STABILITY_ANCHORS,
  FACTOR_WEIGHTS,
  FCF_CONSISTENCY_ANCHORS,
  NET_DEBT_EBITDA_ANCHORS,
  OPERATING_MARGIN_ANCHORS,
  ROA_ANCHORS,
  ROE_ANCHORS,
} from "./constants";
import { percentileInGroup } from "./normalize";
import { buildPillar, makeFactor } from "./factor";
import type { PillarScore, ScoringInput } from "./types";

export function scoreQuality(input: ScoringInput): PillarScore {
  const m = input.metrics;
  const sc = input.sectorContext;
  const W = FACTOR_WEIGHTS.quality;

  // Gross margin is only comparable within a sector (a 13% retail margin can
  // be excellent); scored as a percentile of the comparison group.
  const gmPercentile =
    m.grossMargin !== null && sc.grossMargins.length > 0
      ? percentileInGroup(m.grossMargin, sc.grossMargins)
      : null;

  const roeFactor =
    m.roe !== null
      ? makeFactor({
          key: "roe",
          label: "Return on equity",
          pillar: "quality",
          weight: W.roe,
          rawValue: m.roe,
          rawUnit: "pct",
          anchors: ROE_ANCHORS,
          note: "TTM net income / average book equity.",
        })
      : makeFactor({
          key: "roe",
          label: "Return on equity",
          pillar: "quality",
          weight: W.roe,
          rawValue: m.roa,
          rawUnit: "pct",
          anchors: ROA_ANCHORS,
          note:
            m.roa !== null
              ? "ROE not meaningful (negative/zero book equity, often from buybacks) — ROA scored on its own scale instead."
              : "Unavailable: needs earnings and balance-sheet data.",
        });

  const balanceSheetFactor =
    m.netDebtToEbitda !== null
      ? makeFactor({
          key: "balance_sheet",
          label: "Balance-sheet strength",
          pillar: "quality",
          weight: W.balance_sheet,
          rawValue: m.netDebtToEbitda,
          rawUnit: "x",
          anchors: NET_DEBT_EBITDA_ANCHORS,
          note: "Net debt / TTM EBITDA (negative = net cash).",
        })
      : makeFactor({
          key: "balance_sheet",
          label: "Balance-sheet strength",
          pillar: "quality",
          weight: W.balance_sheet,
          rawValue: m.currentRatio,
          rawUnit: "ratio",
          anchors: CURRENT_RATIO_ANCHORS,
          note:
            m.currentRatio !== null
              ? "Current ratio used (EBITDA not positive or debt/cash data missing)."
              : "Unavailable: no balance-sheet data.",
        });

  const factors = [
    makeFactor({
      key: "gross_margin",
      label: "Gross margin (sector percentile)",
      pillar: "quality",
      weight: W.gross_margin,
      rawValue: m.grossMargin,
      rawUnit: "pct",
      normalized: gmPercentile,
      note:
        m.grossMargin === null
          ? "Unavailable: gross margin not reported (typical for banks/insurers)."
          : `Percentile within ${sc.groupSource === "sector" ? sc.sector : "the universe"} (${sc.groupSize} companies).`,
    }),
    makeFactor({
      key: "operating_margin",
      label: "Operating margin",
      pillar: "quality",
      weight: W.operating_margin,
      rawValue: m.operatingMargin,
      rawUnit: "pct",
      anchors: OPERATING_MARGIN_ANCHORS,
      note: m.operatingMargin === null ? "Unavailable: needs income-statement data." : "TTM operating income / revenue, absolute scale.",
    }),
    roeFactor,
    makeFactor({
      key: "fcf_consistency",
      label: "Free-cash-flow consistency",
      pillar: "quality",
      weight: W.fcf_consistency,
      rawValue: m.fcfConsistency,
      rawUnit: "pct",
      anchors: FCF_CONSISTENCY_ANCHORS,
      note:
        m.fcfConsistency === null
          ? "Unavailable: needs at least 4 quarters of cash-flow data."
          : "Share of the last 8 quarters with positive free cash flow.",
    }),
    balanceSheetFactor,
    makeFactor({
      key: "earnings_stability",
      label: "Earnings stability",
      pillar: "quality",
      weight: W.earnings_stability,
      rawValue: m.earningsVolatility,
      rawUnit: "ratio",
      anchors: EARNINGS_STABILITY_ANCHORS,
      note:
        m.earningsVolatility === null
          ? "Unavailable: needs 2+ years of quarterly EPS with positive base periods."
          : "Stdev of quarterly YoY EPS growth — steadier earnings score higher. (Also appears inverted in the Risk pillar; the overlap is intentional and documented.)",
    }),
  ];

  return buildPillar("quality", factors);
}
