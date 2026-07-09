import type { Rating } from "@/lib/db/json";
import type { PillarKey } from "./types";

/**
 * THE single source of truth for the scoring model. The Methodology page
 * renders directly from these exports; tests assert against them. Change a
 * number here and the docs, UI, and engine stay in lockstep by construction.
 *
 * Anchor tables are [rawValue, score] points; scores between anchors are
 * linearly interpolated and clamped at the ends (see normalize.ts).
 */

// --- Pillar weights (must sum to 1) ---
export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  valuation: 0.25,
  quality: 0.25,
  growth: 0.2,
  momentum: 0.15,
  risk: 0.15,
};

export const PILLAR_LABELS: Record<PillarKey, string> = {
  valuation: "Valuation",
  quality: "Quality",
  growth: "Growth",
  momentum: "Momentum",
  risk: "Risk (safety)",
};

/** A pillar below this coverage is treated as unknown (null). */
export const MIN_PILLAR_COVERAGE = 0.4;
/** Overall coverage below this forces the rating to WATCHLIST. */
export const MIN_OVERALL_COVERAGE = 0.5;

// --- Rating thresholds on the 0-100 overall score ---
export const RATING_THRESHOLDS: { rating: Rating; min: number }[] = [
  { rating: "STRONG_CANDIDATE", min: 72 },
  { rating: "CANDIDATE", min: 58 },
  { rating: "WATCHLIST", min: 42 },
  { rating: "AVOID", min: 0 },
];

export const RATING_LABELS: Record<Rating, string> = {
  STRONG_CANDIDATE: "Strong candidate",
  CANDIDATE: "Candidate",
  WATCHLIST: "Watchlist",
  AVOID: "Avoid",
};

// --- Factor weights within each pillar (each block sums to 1) ---
export const FACTOR_WEIGHTS = {
  valuation: {
    pe_vs_sector: 0.2,
    forward_pe_vs_sector: 0.2,
    peg: 0.15,
    ev_ebitda_vs_sector: 0.15,
    fcf_yield: 0.2,
    ps_growth_adjusted: 0.1,
  },
  quality: {
    gross_margin: 0.15,
    operating_margin: 0.2,
    roe: 0.2,
    fcf_consistency: 0.15,
    balance_sheet: 0.15,
    earnings_stability: 0.15,
  },
  growth: {
    revenue_growth: 0.25,
    revenue_cagr_3y: 0.15,
    eps_growth: 0.2,
    forward_growth: 0.15,
    margin_expansion: 0.15,
    industry_tailwind: 0.1,
  },
  momentum: {
    rel_return_3m: 0.25,
    rel_return_6m: 0.3,
    rel_return_12m_ex_1m: 0.2,
    abs_return_1m: 0.15,
    eps_revision_trend: 0.1,
  },
  risk: {
    debt_to_equity: 0.2,
    interest_coverage: 0.2,
    valuation_compression: 0.15,
    earnings_volatility: 0.15,
    sector_cyclicality: 0.15,
    red_flags: 0.15,
  },
} as const satisfies Record<PillarKey, Record<string, number>>;

// --- Anchor tables: [rawValue, score 0-100] ---
export type AnchorTable = ReadonlyArray<readonly [number, number]>;

/** Ratio of a valuation multiple to its sector median (1.0 = at median). */
export const RATIO_VS_MEDIAN_ANCHORS: AnchorTable = [
  [0.4, 95],
  [0.7, 85],
  [1.0, 60],
  [1.5, 35],
  [2.0, 15],
  [3.0, 5],
];

export const PEG_ANCHORS: AnchorTable = [
  [0.5, 95],
  [1.0, 75],
  [1.5, 55],
  [2.0, 40],
  [3.0, 15],
  [4.0, 5],
];

export const FCF_YIELD_ANCHORS: AnchorTable = [
  [-0.02, 5],
  [0, 15],
  [0.02, 45],
  [0.05, 75],
  [0.08, 95],
];

/** P/S divided by revenue-growth-% (clamped 2..60): cheap growth scores high. */
export const PS_GROWTH_ADJ_ANCHORS: AnchorTable = [
  [0.05, 95],
  [0.15, 80],
  [0.3, 60],
  [0.6, 35],
  [1.0, 15],
  [2.0, 5],
];

export const OPERATING_MARGIN_ANCHORS: AnchorTable = [
  [-0.05, 5],
  [0.05, 30],
  [0.12, 55],
  [0.2, 75],
  [0.3, 90],
  [0.4, 97],
];

export const ROE_ANCHORS: AnchorTable = [
  [-0.05, 5],
  [0.05, 35],
  [0.1, 55],
  [0.15, 70],
  [0.25, 85],
  [0.4, 95],
];

/** Fallback when equity is negative/zero and ROA substitutes for ROE. */
export const ROA_ANCHORS: AnchorTable = [
  [-0.02, 5],
  [0.03, 40],
  [0.07, 65],
  [0.12, 85],
  [0.2, 95],
];

export const FCF_CONSISTENCY_ANCHORS: AnchorTable = [
  [0.25, 10],
  [0.5, 35],
  [0.75, 65],
  [0.9, 85],
  [1.0, 95],
];

/** Net debt / EBITDA (negative = net cash). */
export const NET_DEBT_EBITDA_ANCHORS: AnchorTable = [
  [-1, 95],
  [0, 85],
  [1, 70],
  [2, 55],
  [3, 35],
  [4, 20],
  [6, 5],
];

/** Current ratio fallback when EBITDA <= 0. */
export const CURRENT_RATIO_ANCHORS: AnchorTable = [
  [0.8, 15],
  [1.2, 50],
  [2, 80],
  [3, 90],
];

/** Stdev of quarterly YoY EPS growth (lower = steadier = higher score). */
export const EARNINGS_STABILITY_ANCHORS: AnchorTable = [
  [0.05, 95],
  [0.15, 80],
  [0.3, 60],
  [0.6, 35],
  [1.0, 15],
  [2.0, 5],
];

export const REVENUE_GROWTH_ANCHORS: AnchorTable = [
  [-0.1, 5],
  [0, 25],
  [0.05, 45],
  [0.1, 60],
  [0.2, 80],
  [0.35, 92],
  [0.5, 97],
];

export const EPS_GROWTH_ANCHORS: AnchorTable = [
  [-0.2, 5],
  [0, 25],
  [0.08, 50],
  [0.15, 65],
  [0.3, 85],
  [0.5, 95],
];

/** Operating-margin change vs prior year, in percentage points (decimal). */
export const MARGIN_EXPANSION_ANCHORS: AnchorTable = [
  [-0.04, 10],
  [-0.01, 35],
  [0, 50],
  [0.01, 65],
  [0.03, 85],
  [0.06, 95],
];

export const REL_RETURN_3M_ANCHORS: AnchorTable = [
  [-0.15, 10],
  [-0.05, 35],
  [0, 55],
  [0.05, 70],
  [0.15, 90],
];

export const REL_RETURN_6M_ANCHORS: AnchorTable = [
  [-0.2, 10],
  [-0.08, 35],
  [0, 55],
  [0.08, 72],
  [0.25, 92],
];

export const REL_RETURN_12M_EX_1M_ANCHORS: AnchorTable = [
  [-0.3, 10],
  [-0.1, 35],
  [0, 55],
  [0.1, 70],
  [0.35, 90],
];

export const ABS_RETURN_1M_ANCHORS: AnchorTable = [
  [-0.12, 10],
  [-0.04, 35],
  [0, 55],
  [0.04, 70],
  [0.12, 88],
];

/** Analyst EPS revision trend, -1 (cuts) .. +1 (raises). */
export const EPS_REVISION_ANCHORS: AnchorTable = [
  [-1, 10],
  [0, 50],
  [1, 90],
];

export const DEBT_TO_EQUITY_ANCHORS: AnchorTable = [
  [0, 95],
  [0.3, 85],
  [0.6, 72],
  [1.0, 60],
  [2.0, 35],
  [3.0, 15],
  [5.0, 5],
];

export const INTEREST_COVERAGE_ANCHORS: AnchorTable = [
  [0.5, 5],
  [1, 15],
  [2, 35],
  [4, 60],
  [8, 80],
  [15, 93],
  [30, 97],
];

/**
 * Valuation-compression input: blended percentile (0-100) of today's P/E
 * within (a) the stock's own 3-year monthly P/E history (60%) and (b) the
 * sector's current P/Es (40%). High percentile = stretched = low safety.
 */
export const COMPRESSION_PERCENTILE_ANCHORS: AnchorTable = [
  [0, 90],
  [25, 75],
  [50, 55],
  [75, 35],
  [95, 12],
];
export const COMPRESSION_OWN_HISTORY_WEIGHT = 0.6;

/** Red-flag factor: base score and per-flag penalties over 90 days. */
export const RED_FLAG_BASE_SCORE = 85;
export const RED_FLAG_PENALTIES: Record<string, number> = {
  ITEM_4_02: 40, // non-reliance on prior financials
  LATE_FILING: 25,
  AUDITOR_CHANGE: 20,
};
export const NEGATIVE_SENTIMENT_THRESHOLD = -0.3;
export const NEGATIVE_SENTIMENT_PENALTY = 15;
export const RED_FLAG_FLOOR = 5;

// --- Documented model assumptions (rendered verbatim on Methodology) ---

/** Sector cyclicality: defensive sectors score high (safer). ASSUMPTION. */
export const SECTOR_CYCLICALITY: Record<string, number> = {
  "Consumer Staples": 85,
  "Communication Services": 55,
  "Information Technology": 45,
  Financials: 45,
  Industrials: 45,
  "Consumer Discretionary": 40,
  Energy: 35,
};
export const SECTOR_CYCLICALITY_DEFAULT = 50;

/** Industry tailwind scores. ASSUMPTION — curated, revisit quarterly. */
export const INDUSTRY_TAILWINDS: Record<string, number> = {
  Semiconductors: 85,
  Software: 80,
  "Interactive Media": 75,
  Payments: 75,
  "Internet Retail": 72,
  "Consumer Electronics": 65,
  Automobiles: 60,
  Entertainment: 60,
  "Capital Markets": 60,
  "Asset Management": 55,
  "Discount Stores": 55,
  "Apparel Retail": 50,
  Banks: 50,
  Restaurants: 50,
  Railroads: 45,
  Beverages: 45,
  "Footwear & Apparel": 45,
  "Oil & Gas Midstream": 40,
};
export const INDUSTRY_TAILWIND_DEFAULT = 50;

/** Rating caps (post-composite overrides). */
export const OVERRIDE_RULES = {
  interestCoverageBelow1: {
    code: "INTEREST_COVERAGE_LT_1",
    message:
      "Interest coverage below 1x — operating income does not cover interest expense; rating capped at Watchlist.",
    capAt: "WATCHLIST" as Rating,
  },
  nonReliance180d: {
    code: "NON_RELIANCE_8K",
    message:
      "A non-reliance (Item 4.02) filing within 180 days means prior financials cannot be trusted as reported; rating capped at Watchlist.",
    capAt: "WATCHLIST" as Rating,
  },
  insufficientCoverage: {
    code: "INSUFFICIENT_DATA",
    message:
      "Less than half of the model's factor weight is backed by data; rating forced to Watchlist pending better coverage.",
    capAt: "WATCHLIST" as Rating,
  },
} as const;

/** Winsorization bounds for sector comparison groups. */
export const WINSOR_LOWER = 0.05;
export const WINSOR_UPPER = 0.95;
/** Minimum peers for sector-median comparisons before universe fallback. */
export const MIN_SECTOR_PEERS = 3;

/** P/S growth-adjustment: growth% clamp range (see PS_GROWTH_ADJ_ANCHORS). */
export const PS_GROWTH_CLAMP = { min: 2, max: 60 };
