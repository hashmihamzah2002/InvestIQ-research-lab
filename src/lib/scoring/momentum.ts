import {
  ABS_RETURN_1M_ANCHORS,
  EPS_REVISION_ANCHORS,
  FACTOR_WEIGHTS,
  REL_RETURN_12M_EX_1M_ANCHORS,
  REL_RETURN_3M_ANCHORS,
  REL_RETURN_6M_ANCHORS,
} from "./constants";
import { buildPillar, makeFactor } from "./factor";
import type { PillarScore, ScoringInput } from "./types";

export function scoreMomentum(input: ScoringInput): PillarScore {
  const m = input.metrics;
  const W = FACTOR_WEIGHTS.momentum;

  const rel12ex1 =
    m.relReturn12m !== null && m.relReturn1m !== null
      ? m.relReturn12m - m.relReturn1m
      : null;

  const factors = [
    makeFactor({
      key: "rel_return_3m",
      label: "3-month return vs index",
      pillar: "momentum",
      weight: W.rel_return_3m,
      rawValue: m.relReturn3m,
      rawUnit: "pct",
      anchors: REL_RETURN_3M_ANCHORS,
      note: relNote(m.relReturn3m),
    }),
    makeFactor({
      key: "rel_return_6m",
      label: "6-month return vs index",
      pillar: "momentum",
      weight: W.rel_return_6m,
      rawValue: m.relReturn6m,
      rawUnit: "pct",
      anchors: REL_RETURN_6M_ANCHORS,
      note: relNote(m.relReturn6m),
    }),
    makeFactor({
      key: "rel_return_12m_ex_1m",
      label: "12-month (ex last month) vs index",
      pillar: "momentum",
      weight: W.rel_return_12m_ex_1m,
      rawValue: rel12ex1,
      rawUnit: "pct",
      anchors: REL_RETURN_12M_EX_1M_ANCHORS,
      note:
        rel12ex1 === null
          ? "Unavailable: needs 12 months of stock and index prices."
          : "Classic momentum window: trailing year excluding the most recent month (which tends to mean-revert).",
    }),
    makeFactor({
      key: "abs_return_1m",
      label: "1-month return",
      pillar: "momentum",
      weight: W.abs_return_1m,
      rawValue: m.return1m,
      rawUnit: "pct",
      anchors: ABS_RETURN_1M_ANCHORS,
      note:
        m.return1m === null
          ? "Unavailable: needs a month of price history."
          : "Absolute (not index-relative) short-term move.",
    }),
    makeFactor({
      key: "eps_revision_trend",
      label: "Earnings revision trend",
      pillar: "momentum",
      weight: W.eps_revision_trend,
      rawValue: m.epsRevisionTrend,
      rawUnit: "score",
      anchors: EPS_REVISION_ANCHORS,
      note:
        m.epsRevisionTrend === null
          ? "Unavailable: no provider supplies revision data in the current chain."
          : "Provider-supplied trend of analyst estimate changes, -1 (cuts) to +1 (raises).",
    }),
  ];

  return buildPillar("momentum", factors);
}

function relNote(value: number | null): string {
  return value === null
    ? "Unavailable: needs stock and index price history for the window."
    : "Stock return minus the S&P 500 proxy (SPY) return over the same window.";
}
