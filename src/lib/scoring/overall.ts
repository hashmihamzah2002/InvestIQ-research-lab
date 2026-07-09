import type { Rating } from "@/lib/db/json";
import {
  MIN_OVERALL_COVERAGE,
  OVERRIDE_RULES,
  RATING_LABELS,
  RATING_THRESHOLDS,
} from "./constants";
import { scoreGrowth } from "./growth";
import { scoreMomentum } from "./momentum";
import { scoreQuality } from "./quality";
import { scoreRisk } from "./risk";
import { scoreValuation } from "./valuation";
import type { PillarScore, ScoreBreakdown, ScoreOverride, ScoringInput } from "./types";

/** Severity order: index 0 is best. */
const RATING_ORDER: Rating[] = [
  "STRONG_CANDIDATE",
  "CANDIDATE",
  "WATCHLIST",
  "AVOID",
];

export function ratingFromScore(overall: number): Rating {
  for (const { rating, min } of RATING_THRESHOLDS) {
    if (overall >= min) return rating;
  }
  return "AVOID";
}

function worseOf(a: Rating, b: Rating): Rating {
  return RATING_ORDER[Math.max(RATING_ORDER.indexOf(a), RATING_ORDER.indexOf(b))];
}

/**
 * The full scoring pass for one company: five pillars -> reweighted composite
 * -> rating with explicit overrides. Everything the UI needs to explain the
 * result is in the returned breakdown.
 */
export function computeScores(input: ScoringInput): ScoreBreakdown {
  const pillars: PillarScore[] = [
    scoreValuation(input),
    scoreQuality(input),
    scoreGrowth(input),
    scoreMomentum(input),
    scoreRisk(input),
  ];

  const scored = pillars.filter((p) => p.score !== null);
  const scoredWeight = scored.reduce((acc, p) => acc + p.weight, 0);
  const overall =
    scoredWeight > 0
      ? Math.round(
          (scored.reduce((acc, p) => acc + p.score! * p.weight, 0) / scoredWeight) * 100,
        ) / 100
      : 0;
  const coverage =
    Math.round(
      pillars.reduce((acc, p) => acc + p.weight * p.coverage, 0) * 10000,
    ) / 10000;

  // --- Overrides (always surfaced, never silent) ---
  const overrides: ScoreOverride[] = [];
  if (coverage < MIN_OVERALL_COVERAGE) {
    overrides.push({ ...OVERRIDE_RULES.insufficientCoverage });
  }
  const ic = input.metrics.interestCoverage;
  if (ic !== null && ic < 1) {
    overrides.push({ ...OVERRIDE_RULES.interestCoverageBelow1 });
  }
  if (input.filingFlags180d.includes("ITEM_4_02")) {
    overrides.push({ ...OVERRIDE_RULES.nonReliance180d });
  }

  let rating = ratingFromScore(overall);
  for (const override of overrides) {
    rating = worseOf(rating, override.capAt);
  }
  // Insufficient data FORCES Watchlist in both directions: without evidence
  // the model may neither promote nor condemn.
  if (overrides.some((o) => o.code === OVERRIDE_RULES.insufficientCoverage.code)) {
    rating = "WATCHLIST";
  }

  const ratingReason = buildRatingReason(overall, coverage, rating, pillars, overrides);

  return { pillars, overall, coverage, rating, ratingReason, overrides };
}

function buildRatingReason(
  overall: number,
  coverage: number,
  rating: Rating,
  pillars: PillarScore[],
  overrides: ScoreOverride[],
): string {
  const scored = pillars.filter((p) => p.score !== null);
  const parts: string[] = [];
  parts.push(
    `Overall model score ${overall.toFixed(1)}/100 with ${(coverage * 100).toFixed(0)}% of factor weight backed by data.`,
  );
  if (scored.length > 0) {
    const strongest = scored.reduce((a, b) => (b.score! > a.score! ? b : a));
    const weakest = scored.reduce((a, b) => (b.score! < a.score! ? b : a));
    parts.push(
      `Strongest pillar: ${strongest.label} (${strongest.score!.toFixed(0)}). Weakest: ${weakest.label} (${weakest.score!.toFixed(0)}).`,
    );
  }
  const base = ratingFromScore(overall);
  if (base !== rating) {
    parts.push(
      `Score alone would map to "${RATING_LABELS[base]}", but overrides cap the rating: ${overrides
        .map((o) => o.code)
        .join(", ")}.`,
    );
  }
  parts.push(
    `Educational rating: ${RATING_LABELS[rating]} — model output from stated inputs and weights, not personal advice.`,
  );
  return parts.join(" ");
}
