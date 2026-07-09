/**
 * Canonical macro series tracked by the app. `seriesId` is OUR identifier;
 * the FRED adapter maps it to a source series + transform, the mock adapter
 * generates it directly, and CSV imports reference it by seriesId.
 */
export interface MacroSeriesDef {
  seriesId: string;
  name: string;
  unit: string;
  description: string;
  fred: {
    sourceSeries: string;
    /** level = use values as-is; yoy = % change vs 12 months prior. */
    transform: "level" | "yoy";
  };
}

export const MACRO_CATALOG: readonly MacroSeriesDef[] = [
  {
    seriesId: "FEDFUNDS",
    name: "Federal Funds Effective Rate",
    unit: "percent",
    description: "Overnight rate set by Fed policy; anchors all USD financing costs.",
    fred: { sourceSeries: "FEDFUNDS", transform: "level" },
  },
  {
    seriesId: "CPI_YOY",
    name: "CPI Inflation (YoY)",
    unit: "percent",
    description: "Consumer price inflation, year over year.",
    fred: { sourceSeries: "CPIAUCSL", transform: "yoy" },
  },
  {
    seriesId: "UNRATE",
    name: "Unemployment Rate",
    unit: "percent",
    description: "U-3 unemployment rate.",
    fred: { sourceSeries: "UNRATE", transform: "level" },
  },
  {
    seriesId: "GDP_GROWTH",
    name: "Real GDP Growth (YoY)",
    unit: "percent",
    description: "Real gross domestic product, year over year growth.",
    fred: { sourceSeries: "GDPC1", transform: "yoy" },
  },
  {
    seriesId: "DGS10",
    name: "10-Year Treasury Yield",
    unit: "percent",
    description: "Benchmark long rate; discount-rate proxy for equity valuation.",
    fred: { sourceSeries: "DGS10", transform: "level" },
  },
  {
    seriesId: "DGS2",
    name: "2-Year Treasury Yield",
    unit: "percent",
    description: "Short-end policy expectations.",
    fred: { sourceSeries: "DGS2", transform: "level" },
  },
  {
    seriesId: "T10Y2Y",
    name: "10Y-2Y Treasury Spread",
    unit: "percent",
    description: "Yield-curve slope; inversions historically precede recessions.",
    fred: { sourceSeries: "T10Y2Y", transform: "level" },
  },
] as const;
