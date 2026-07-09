import {
  COMPRESSION_OWN_HISTORY_WEIGHT,
  COMPRESSION_PERCENTILE_ANCHORS,
  DEBT_TO_EQUITY_ANCHORS,
  EARNINGS_STABILITY_ANCHORS,
  FACTOR_WEIGHTS,
  INTEREST_COVERAGE_ANCHORS,
  NEGATIVE_SENTIMENT_PENALTY,
  NEGATIVE_SENTIMENT_THRESHOLD,
  NET_DEBT_EBITDA_ANCHORS,
  RED_FLAG_BASE_SCORE,
  RED_FLAG_FLOOR,
  RED_FLAG_PENALTIES,
  SECTOR_CYCLICALITY,
  SECTOR_CYCLICALITY_DEFAULT,
} from "./constants";
import { clamp, percentileInGroup } from "./normalize";
import { buildPillar, makeFactor } from "./factor";
import type { PillarScore, ScoringInput } from "./types";

/**
 * Risk pillar, scored as SAFETY: 100 = low risk. The UI labels it
 * "Risk (safety)" so a high number is unambiguously good.
 */
export function scoreRisk(input: ScoringInput): PillarScore {
  const m = input.metrics;
  const W = FACTOR_WEIGHTS.risk;

  // --- Leverage (with negative-equity fallback) ---
  const leverageFactor =
    m.debtToEquity !== null
      ? makeFactor({
          key: "debt_to_equity",
          label: "Debt / equity",
          pillar: "risk",
          weight: W.debt_to_equity,
          rawValue: m.debtToEquity,
          rawUnit: "x",
          anchors: DEBT_TO_EQUITY_ANCHORS,
          note: "Total debt / book equity.",
        })
      : makeFactor({
          key: "debt_to_equity",
          label: "Debt / equity",
          pillar: "risk",
          weight: W.debt_to_equity,
          rawValue: m.netDebtToEbitda,
          rawUnit: "x",
          anchors: NET_DEBT_EBITDA_ANCHORS,
          note:
            m.netDebtToEbitda !== null
              ? "Book equity negative/missing — net debt / EBITDA scored instead."
              : "Unavailable: no usable leverage data.",
        });

  // --- Interest coverage (debt-free companies score high, with a note) ---
  let coverageFactor;
  if (m.interestCoverage !== null) {
    coverageFactor = makeFactor({
      key: "interest_coverage",
      label: "Interest coverage",
      pillar: "risk",
      weight: W.interest_coverage,
      rawValue: m.interestCoverage,
      rawUnit: "x",
      anchors: INTEREST_COVERAGE_ANCHORS,
      note: "TTM operating income / interest expense.",
    });
  } else if (m.debtToEquity !== null && m.debtToEquity < 0.2) {
    coverageFactor = makeFactor({
      key: "interest_coverage",
      label: "Interest coverage",
      pillar: "risk",
      weight: W.interest_coverage,
      rawValue: null,
      rawUnit: "x",
      normalized: 90,
      note: "No material interest expense with minimal debt — treated as strong coverage.",
    });
  } else {
    coverageFactor = makeFactor({
      key: "interest_coverage",
      label: "Interest coverage",
      pillar: "risk",
      weight: W.interest_coverage,
      rawValue: null,
      rawUnit: "x",
      note: "Unavailable: interest expense not reported.",
    });
  }

  // --- Valuation compression: today's P/E vs own history and sector ---
  let compressionFactor;
  const ownPes = m.peHistory
    .map((p) => p.pe)
    .filter((pe): pe is number => pe !== null);
  if (m.pe !== null && (ownPes.length >= 8 || input.sectorContext.pes.length >= 3)) {
    const parts: { pctl: number; weight: number }[] = [];
    if (ownPes.length >= 8) {
      parts.push({
        pctl: percentileInGroup(m.pe, ownPes),
        weight: COMPRESSION_OWN_HISTORY_WEIGHT,
      });
    }
    if (input.sectorContext.pes.length >= 3) {
      parts.push({
        pctl: percentileInGroup(m.pe, input.sectorContext.pes),
        weight: 1 - COMPRESSION_OWN_HISTORY_WEIGHT,
      });
    }
    const totalW = parts.reduce((a, p) => a + p.weight, 0);
    const blended = parts.reduce((a, p) => a + p.pctl * p.weight, 0) / totalW;
    compressionFactor = makeFactor({
      key: "valuation_compression",
      label: "Valuation compression risk",
      pillar: "risk",
      weight: W.valuation_compression,
      rawValue: Math.round(blended * 100) / 100,
      rawUnit: "pctl",
      anchors: COMPRESSION_PERCENTILE_ANCHORS,
      note: `P/E percentile blend: ${ownPes.length >= 8 ? `own 3y history (${ownPes.length} months)` : "own history too short"}${input.sectorContext.pes.length >= 3 ? " + sector peers" : ""}. High percentile = more room to de-rate.`,
    });
  } else {
    compressionFactor = makeFactor({
      key: "valuation_compression",
      label: "Valuation compression risk",
      pillar: "risk",
      weight: W.valuation_compression,
      rawValue: null,
      rawUnit: "pctl",
      note: "Unavailable: needs a P/E plus history or peer group.",
    });
  }

  // --- Red flags from filings + news sentiment ---
  let redFlagScore = RED_FLAG_BASE_SCORE;
  const flagNotes: string[] = [];
  for (const flag of input.filingFlags90d) {
    const penalty = RED_FLAG_PENALTIES[flag] ?? 10;
    redFlagScore -= penalty;
    flagNotes.push(`${flag} (−${penalty})`);
  }
  const sentiment = m.sentiment90d;
  if (sentiment !== null && sentiment <= NEGATIVE_SENTIMENT_THRESHOLD) {
    redFlagScore -= NEGATIVE_SENTIMENT_PENALTY;
    flagNotes.push(
      `negative news sentiment ${sentiment.toFixed(2)} (−${NEGATIVE_SENTIMENT_PENALTY})`,
    );
  }
  redFlagScore = clamp(redFlagScore, RED_FLAG_FLOOR, 95);

  const factors = [
    leverageFactor,
    coverageFactor,
    compressionFactor,
    makeFactor({
      key: "earnings_volatility",
      label: "Earnings volatility",
      pillar: "risk",
      weight: W.earnings_volatility,
      rawValue: m.earningsVolatility,
      rawUnit: "ratio",
      anchors: EARNINGS_STABILITY_ANCHORS,
      note:
        m.earningsVolatility === null
          ? "Unavailable: needs 2+ years of quarterly EPS."
          : "Same input as Quality's earnings stability, risk-framed (intentional overlap, see Methodology).",
    }),
    makeFactor({
      key: "sector_cyclicality",
      label: "Sector cyclicality",
      pillar: "risk",
      weight: W.sector_cyclicality,
      rawValue: SECTOR_CYCLICALITY[input.sector] ?? SECTOR_CYCLICALITY_DEFAULT,
      rawUnit: "score",
      normalized: SECTOR_CYCLICALITY[input.sector] ?? SECTOR_CYCLICALITY_DEFAULT,
      note: `Static model assumption for ${input.sector} (defensive sectors score higher — see Methodology).`,
    }),
    makeFactor({
      key: "red_flags",
      label: "Filing / news red flags",
      pillar: "risk",
      weight: W.red_flags,
      rawValue: input.filingFlags90d.length,
      rawUnit: "count",
      normalized: redFlagScore,
      note:
        flagNotes.length > 0
          ? `Flags in last 90 days: ${flagNotes.join(", ")}.`
          : "No filing red flags detected in the last 90 days (customer-concentration data not available — see limitations).",
    }),
  ];

  return buildPillar("risk", factors);
}
