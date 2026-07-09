import type { FactorScore } from "./types";

/** Unit-aware raw-value formatting shared by narrative, reports, and UI. */
export function formatRawValue(
  value: number | null,
  unit: string,
): string {
  if (value === null) return "—";
  switch (unit) {
    case "pct":
      return `${(value * 100).toFixed(1)}%`;
    case "pp":
      return `${(value * 100).toFixed(1)}pp`;
    case "x":
      return `${value.toFixed(1)}×`;
    case "x-median":
      return `${value.toFixed(2)}× sector median`;
    case "pctl":
      return `${value.toFixed(0)}th percentile`;
    case "count":
      return `${value.toFixed(0)}`;
    case "score":
      return `${value.toFixed(0)}/100`;
    default:
      return value.toFixed(2);
  }
}

export function formatFactorRaw(factor: FactorScore): string {
  return formatRawValue(factor.rawValue, factor.rawUnit);
}
