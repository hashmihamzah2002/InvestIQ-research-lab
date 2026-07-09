import { RATING_LABELS, RATING_THRESHOLDS } from "./constants";
import { formatFactorRaw } from "./format";
import { ratingFromScore } from "./overall";
import type { FactorScore, ScoreBreakdown, ScoringInput } from "./types";

/**
 * Deterministic, rule-based narrative built purely from the score breakdown —
 * no black box, same inputs -> same words. Language is deliberately
 * calibrated ("screens as", "the model scores") and covered by the
 * banned-phrase compliance test.
 */
export interface Narrative {
  bullCase: string[];
  bearCase: string[];
  keyRisks: string[];
  changeMyMind: string[];
}

interface Contribution {
  factor: FactorScore;
  /** (normalized - 50) x weightInPillar x pillarWeight — signed pull on the overall score. */
  value: number;
}

function contributions(breakdown: ScoreBreakdown): Contribution[] {
  const out: Contribution[] = [];
  for (const pillar of breakdown.pillars) {
    for (const factor of pillar.factors) {
      if (!factor.available || factor.normalized === null) continue;
      out.push({
        factor,
        value: ((factor.normalized - 50) / 50) * factor.weight * pillar.weight,
      });
    }
  }
  return out;
}

function describeStrength(f: FactorScore): string {
  return `${f.label} screens favorably at ${formatFactorRaw(f)} (${f.normalized!.toFixed(0)}/100 in the model).`;
}

function describeWeakness(f: FactorScore): string {
  return `${f.label} screens unfavorably at ${formatFactorRaw(f)} (${f.normalized!.toFixed(0)}/100 in the model).`;
}

export function buildNarrative(
  input: ScoringInput,
  breakdown: ScoreBreakdown,
): Narrative {
  const contribs = contributions(breakdown);
  const sorted = [...contribs].sort((a, b) => b.value - a.value);

  const bullCase = sorted
    .filter((c) => c.value > 0)
    .slice(0, 3)
    .map((c) => describeStrength(c.factor));
  if (bullCase.length === 0) {
    bullCase.push(
      "No factor currently pulls the score meaningfully upward; the model sees little standout strength at these inputs.",
    );
  }

  const bearCase = sorted
    .filter((c) => c.value < 0)
    .slice(-3)
    .reverse()
    .map((c) => describeWeakness(c.factor));
  if (bearCase.length === 0) {
    bearCase.push(
      "No factor currently pulls the score meaningfully downward — which itself deserves skepticism; inputs can change quickly.",
    );
  }

  // --- Key risks: weak risk-pillar factors + explicit flags ---
  const riskPillar = breakdown.pillars.find((p) => p.key === "risk")!;
  const keyRisks = riskPillar.factors
    .filter((f) => f.available && f.normalized !== null && f.normalized < 45)
    .map(
      (f) =>
        `${f.label}: ${formatFactorRaw(f)} — scores ${f.normalized!.toFixed(0)}/100 on the safety scale. ${f.note ?? ""}`.trim(),
    );
  for (const override of breakdown.overrides) {
    keyRisks.push(override.message);
  }
  if (input.filingFlags90d.length > 0) {
    keyRisks.push(
      `Recent filing flags (90d): ${input.filingFlags90d.join(", ")} — review the filings themselves before drawing conclusions.`,
    );
  }
  if (keyRisks.length === 0) {
    keyRisks.push(
      "No factor-level red flags at current thresholds. General market, execution, and model-assumption risks still apply, and customer-concentration data is not modeled.",
    );
  }

  return {
    bullCase,
    bearCase,
    keyRisks,
    changeMyMind: buildChangeMyMind(breakdown),
  };
}

/**
 * "What would change my mind?" — invert the rating thresholds: how many
 * points (and via which pillar) would move the rating up or down one band.
 */
function buildChangeMyMind(breakdown: ScoreBreakdown): string[] {
  const out: string[] = [];
  const { overall } = breakdown;
  const scored = breakdown.pillars.filter((p) => p.score !== null);
  const scoredWeight = scored.reduce((acc, p) => acc + p.weight, 0);

  const currentBand = ratingFromScore(overall);
  const bandIdx = RATING_THRESHOLDS.findIndex((t) => t.rating === currentBand);

  // Upgrade path.
  if (bandIdx > 0) {
    const nextUp = RATING_THRESHOLDS[bandIdx - 1];
    const needed = nextUp.min - overall;
    const weakest = scored.reduce((a, b) => (b.score! < a.score! ? b : a));
    const pillarDelta = (needed * scoredWeight) / weakest.weight;
    const target = weakest.score! + pillarDelta;
    if (target <= 100) {
      const weakFactor = weakest.factors
        .filter((f) => f.available)
        .sort((a, b) => a.normalized! - b.normalized!)[0];
      out.push(
        `Upgrade to "${RATING_LABELS[nextUp.rating]}" needs the overall score to rise ${needed.toFixed(1)} points (to ${nextUp.min}). The lowest pillar, ${weakest.label} (${weakest.score!.toFixed(0)}), reaching about ${Math.min(100, target).toFixed(0)} would do it alone — watch ${weakFactor ? `${weakFactor.label.toLowerCase()} (now ${formatFactorRaw(weakFactor)})` : "its underlying inputs"}.`,
      );
    } else {
      out.push(
        `Upgrade to "${RATING_LABELS[nextUp.rating]}" needs +${needed.toFixed(1)} overall points — more than any single pillar can deliver from here; it would take broad improvement across several factors.`,
      );
    }
  } else {
    out.push(
      "Already in the top rating band. The question flips: what deterioration would justify a downgrade? See below.",
    );
  }

  // Downgrade path.
  const currentMin = RATING_THRESHOLDS[bandIdx].min;
  if (currentBand !== "AVOID") {
    const cushion = overall - currentMin;
    const strongest = scored.reduce((a, b) => (b.score! > a.score! ? b : a));
    const pillarDrop = (cushion * scoredWeight) / strongest.weight;
    out.push(
      `Downgrade risk: a ${cushion.toFixed(1)}-point overall decline crosses into the next band. That is roughly the ${strongest.label} pillar (${strongest.score!.toFixed(0)}) falling ${Math.min(100, pillarDrop).toFixed(0)} points, or smaller declines across several pillars.`,
    );
  }

  if (breakdown.coverage < 0.8) {
    out.push(
      `Data coverage is ${(breakdown.coverage * 100).toFixed(0)}% — filling the missing factors (see breakdown) could move the score in either direction.`,
    );
  }
  if (breakdown.overrides.length > 0) {
    out.push(
      `Overrides currently cap the rating (${breakdown.overrides.map((o) => o.code).join(", ")}); clearing them matters more than any score change.`,
    );
  }
  return out;
}
