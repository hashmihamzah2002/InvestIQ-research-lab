import type { AnchorTable } from "./constants";

/**
 * Normalization primitives. Pure, exhaustively unit-tested — every scored
 * number in the app flows through one of these three functions.
 */

/**
 * Piecewise-linear interpolation over [rawValue, score] anchors.
 * Values beyond the first/last anchor clamp to that anchor's score.
 * Anchors must be sorted ascending by rawValue.
 */
export function piecewiseLinear(value: number, anchors: AnchorTable): number {
  if (anchors.length === 0) throw new Error("piecewiseLinear: empty anchors");
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      const t = x1 === x0 ? 0 : (value - x0) / (x1 - x0);
      return round2(y0 + t * (y1 - y0));
    }
  }
  return last[1]; // unreachable with sorted anchors
}

/**
 * Midrank percentile (0-100) of value within a comparison group. Ties share
 * their average rank; a singleton group returns 50 (no information).
 */
export function percentileInGroup(value: number, group: number[]): number {
  const clean = group.filter((g) => Number.isFinite(g));
  if (clean.length <= 1) return 50;
  let below = 0;
  let equal = 0;
  for (const g of clean) {
    if (g < value) below++;
    else if (g === value) equal++;
  }
  // Midrank: count self if present in group; otherwise treat as inserted.
  const n = equal > 0 ? clean.length : clean.length + 1;
  const rank = below + (equal > 0 ? (equal + 1) / 2 : 1);
  return round2(((rank - 0.5) / n) * 100);
}

/** Clamp each value to the [p_lower, p_upper] quantiles of the sample. */
export function winsorize(
  values: number[],
  lower = 0.05,
  upper = 0.95,
): number[] {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return [];
  const sorted = [...clean].sort((a, b) => a - b);
  const lo = quantileSorted(sorted, lower);
  const hi = quantileSorted(sorted, upper);
  return clean.map((v) => Math.min(hi, Math.max(lo, v)));
}

/** Linear-interpolated quantile of a pre-sorted ascending array. */
export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantile of empty array");
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  return quantileSorted(sorted, 0.5);
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
