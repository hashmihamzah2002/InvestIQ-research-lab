import { MIN_PILLAR_COVERAGE, PILLAR_LABELS, PILLAR_WEIGHTS, type AnchorTable } from "./constants";
import { piecewiseLinear } from "./normalize";
import type { FactorScore, PillarKey, PillarScore } from "./types";

/**
 * Factor/pillar assembly helpers. A factor is "available" when it produced a
 * normalized score; unavailable factors keep their raw slot in the breakdown
 * (with a note) so the UI can show exactly what is missing and why.
 */
export function makeFactor(args: {
  key: string;
  label: string;
  pillar: PillarKey;
  weight: number;
  rawValue: number | null | undefined;
  rawUnit: string;
  /** Normalize rawValue through these anchors (unless normalized given). */
  anchors?: AnchorTable;
  /** Direct normalized score (skips anchors). */
  normalized?: number | null;
  note?: string;
}): FactorScore {
  const rawValue = args.rawValue ?? null;
  let normalized = args.normalized ?? null;
  if (normalized === null && rawValue !== null && args.anchors) {
    normalized = piecewiseLinear(rawValue, args.anchors);
  }
  return {
    key: args.key,
    label: args.label,
    pillar: args.pillar,
    rawValue,
    rawUnit: args.rawUnit,
    normalized,
    weight: args.weight,
    available: normalized !== null,
    note: args.note,
  };
}

/** Weighted mean over available factors, reweighted; coverage recorded. */
export function buildPillar(key: PillarKey, factors: FactorScore[]): PillarScore {
  const availableWeight = factors
    .filter((f) => f.available)
    .reduce((acc, f) => acc + f.weight, 0);
  const totalWeight = factors.reduce((acc, f) => acc + f.weight, 0);
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;

  let score: number | null = null;
  if (coverage >= MIN_PILLAR_COVERAGE && availableWeight > 0) {
    const weightedSum = factors
      .filter((f) => f.available)
      .reduce((acc, f) => acc + f.normalized! * f.weight, 0);
    score = Math.round((weightedSum / availableWeight) * 100) / 100;
  }

  return {
    key,
    label: PILLAR_LABELS[key],
    score,
    coverage: Math.round(coverage * 10000) / 10000,
    weight: PILLAR_WEIGHTS[key],
    factors,
  };
}
