import type { MetricsResult } from "@/lib/metrics/types";
import type { Rating } from "@/lib/db/json";

export type PillarKey = "valuation" | "quality" | "growth" | "momentum" | "risk";

/** One scored factor — the atomic unit of explainability. */
export interface FactorScore {
  key: string;
  label: string;
  pillar: PillarKey;
  /** Raw input value (pre-normalization); null when unavailable. */
  rawValue: number | null;
  /** Display unit for rawValue: "x", "%", "pp", "ratio", "score". */
  rawUnit: string;
  /** 0-100 after normalization; null when unavailable. */
  normalized: number | null;
  /** Weight within the pillar (fractions sum to 1 per pillar). */
  weight: number;
  available: boolean;
  /** Human note: guards applied, fallbacks used, comparison group, etc. */
  note?: string;
}

export interface PillarScore {
  key: PillarKey;
  label: string;
  /** Weighted mean of available factors (reweighted); null if coverage < min. */
  score: number | null;
  /** Share of factor weight backed by data, 0..1. */
  coverage: number;
  /** Weight of this pillar in the overall score. */
  weight: number;
  factors: FactorScore[];
}

/** A rating cap/force applied after the composite — always surfaced. */
export interface ScoreOverride {
  code: string;
  message: string;
  /** Rating ceiling imposed. */
  capAt: Rating;
}

export interface ScoreBreakdown {
  pillars: PillarScore[];
  /** 0-100 composite (pillar-reweighted when a pillar is null). */
  overall: number;
  /** Weighted data coverage across all pillars, 0..1. */
  coverage: number;
  rating: Rating;
  ratingReason: string;
  overrides: ScoreOverride[];
}

/** Sector comparison stats used by relative-valuation factors. */
export interface SectorContext {
  sector: string;
  /** "sector" when >=3 peers, else "universe" fallback. */
  groupSource: "sector" | "universe";
  groupSize: number;
  medianPe: number | null;
  medianForwardPe: number | null;
  medianEvToEbitda: number | null;
  medianPriceToSales: number | null;
  /** Winsorized gross margins of the comparison group (percentile input). */
  grossMargins: number[];
  /** Winsorized P/Es of the comparison group (compression percentile input). */
  pes: number[];
}

export interface ScoringInput {
  ticker: string;
  sector: string;
  industry: string;
  metrics: MetricsResult;
  /** Red-flag codes on filings within the last 90 days. */
  filingFlags90d: string[];
  /** Same flags within 180 days (rating caps look further back). */
  filingFlags180d: string[];
  sectorContext: SectorContext;
}
