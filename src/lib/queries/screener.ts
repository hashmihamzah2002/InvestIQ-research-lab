import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { RatingSchema, type Rating } from "@/lib/db/json";

/**
 * Screener query + row shape. The Zod schema is shared by the API route
 * (searchParams validation) and any server-side callers. Filtering happens
 * in TS after loading the universe join — deliberate simplicity for a
 * 30-1000 row universe (documented trade-off).
 */
export const ScreenerQuerySchema = z.object({
  sector: z.string().optional(),
  rating: RatingSchema.optional(),
  marketCapMin: z.coerce.number().optional(), // USD
  marketCapMax: z.coerce.number().optional(),
  peMax: z.coerce.number().optional(),
  forwardPeMax: z.coerce.number().optional(),
  pegMax: z.coerce.number().optional(),
  revenueGrowthMin: z.coerce.number().optional(), // decimal, 0.1 = 10%
  grossMarginMin: z.coerce.number().optional(),
  operatingMarginMin: z.coerce.number().optional(),
  debtToEquityMax: z.coerce.number().optional(),
  fcfYieldMin: z.coerce.number().optional(),
  dividendYieldMin: z.coerce.number().optional(),
  sentimentMin: z.coerce.number().min(-1).max(1).optional(),
  valuationMin: z.coerce.number().min(0).max(100).optional(),
  qualityMin: z.coerce.number().min(0).max(100).optional(),
  growthMin: z.coerce.number().min(0).max(100).optional(),
  momentumMin: z.coerce.number().min(0).max(100).optional(),
  riskMin: z.coerce.number().min(0).max(100).optional(),
  sort: z
    .enum([
      "rank", "overall", "valuation", "quality", "growth", "momentum", "risk",
      "marketCap", "pe", "forwardPe", "peg", "revenueGrowth", "grossMargin",
      "operatingMargin", "debtToEquity", "fcfYield", "dividendYield",
      "sentiment", "ticker",
    ])
    .default("rank"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ScreenerQuery = z.infer<typeof ScreenerQuerySchema>;

export interface ScreenerRow {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  revenueGrowthYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  debtToEquity: number | null;
  fcfYield: number | null;
  dividendYield: number | null;
  sentiment90d: number | null;
  valuationScore: number | null;
  qualityScore: number | null;
  growthScore: number | null;
  momentumScore: number | null;
  riskScore: number | null;
  overallScore: number;
  rating: Rating;
  rank: number | null;
  priceSource: string;
  asOf: string;
}

export interface ScreenerResult {
  rows: ScreenerRow[];
  asOf: string | null;
  totalUniverse: number;
  sectors: string[];
}

export async function runScreener(query: ScreenerQuery): Promise<ScreenerResult> {
  const latest = await prisma.scoreSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return { rows: [], asOf: null, totalUniverse: 0, sectors: [] };

  const scores = await prisma.scoreSnapshot.findMany({
    where: { date: latest.date },
    include: { company: true },
  });
  const metrics = await prisma.metricSnapshot.findMany({
    where: { asOf: latest.date },
  });
  const metricsByCompany = new Map(metrics.map((m) => [m.companyId, m]));

  const all: ScreenerRow[] = scores.map((s) => {
    const m = metricsByCompany.get(s.companyId);
    return {
      ticker: s.company.ticker,
      name: s.company.name,
      sector: s.company.sector,
      industry: s.company.industry,
      marketCap: m?.marketCap ?? null,
      pe: m?.pe ?? null,
      forwardPe: m?.forwardPe ?? null,
      peg: m?.peg ?? null,
      revenueGrowthYoY: m?.revenueGrowthYoY ?? null,
      grossMargin: m?.grossMargin ?? null,
      operatingMargin: m?.operatingMargin ?? null,
      debtToEquity: m?.debtToEquity ?? null,
      fcfYield: m?.fcfYield ?? null,
      dividendYield: m?.dividendYield ?? null,
      sentiment90d: m?.sentiment90d ?? null,
      valuationScore: s.valuationScore,
      qualityScore: s.qualityScore,
      growthScore: s.growthScore,
      momentumScore: s.momentumScore,
      riskScore: s.riskScore,
      overallScore: s.overallScore,
      rating: s.rating as Rating,
      rank: s.rank,
      priceSource: parsePriceSource(m?.dataQualityJson),
      asOf: latest.date.toISOString(),
    };
  });

  const gte = (v: number | null, min?: number) => min === undefined || (v !== null && v >= min);
  const lte = (v: number | null, max?: number) => max === undefined || (v !== null && v <= max);

  const rows = all.filter(
    (r) =>
      (!query.sector || r.sector === query.sector) &&
      (!query.rating || r.rating === query.rating) &&
      gte(r.marketCap, query.marketCapMin) &&
      lte(r.marketCap, query.marketCapMax) &&
      lte(r.pe, query.peMax) &&
      lte(r.forwardPe, query.forwardPeMax) &&
      lte(r.peg, query.pegMax) &&
      gte(r.revenueGrowthYoY, query.revenueGrowthMin) &&
      gte(r.grossMargin, query.grossMarginMin) &&
      gte(r.operatingMargin, query.operatingMarginMin) &&
      lte(r.debtToEquity, query.debtToEquityMax) &&
      gte(r.fcfYield, query.fcfYieldMin) &&
      gte(r.dividendYield, query.dividendYieldMin) &&
      gte(r.sentiment90d, query.sentimentMin) &&
      gte(r.valuationScore, query.valuationMin) &&
      gte(r.qualityScore, query.qualityMin) &&
      gte(r.growthScore, query.growthMin) &&
      gte(r.momentumScore, query.momentumMin) &&
      gte(r.riskScore, query.riskMin),
  );

  const key = sortKey(query.sort);
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (av === null && bv === null) return a.ticker.localeCompare(b.ticker);
    if (av === null) return 1; // nulls last regardless of direction
    if (bv === null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * dir;
    }
    return ((av as number) - (bv as number)) * dir;
  });

  return {
    rows,
    asOf: latest.date.toISOString(),
    totalUniverse: all.length,
    sectors: [...new Set(all.map((r) => r.sector))].sort(),
  };
}

function sortKey(sort: ScreenerQuery["sort"]): (r: ScreenerRow) => number | string | null {
  switch (sort) {
    case "rank": return (r) => r.rank;
    case "overall": return (r) => r.overallScore;
    case "valuation": return (r) => r.valuationScore;
    case "quality": return (r) => r.qualityScore;
    case "growth": return (r) => r.growthScore;
    case "momentum": return (r) => r.momentumScore;
    case "risk": return (r) => r.riskScore;
    case "marketCap": return (r) => r.marketCap;
    case "pe": return (r) => r.pe;
    case "forwardPe": return (r) => r.forwardPe;
    case "peg": return (r) => r.peg;
    case "revenueGrowth": return (r) => r.revenueGrowthYoY;
    case "grossMargin": return (r) => r.grossMargin;
    case "operatingMargin": return (r) => r.operatingMargin;
    case "debtToEquity": return (r) => r.debtToEquity;
    case "fcfYield": return (r) => r.fcfYield;
    case "dividendYield": return (r) => r.dividendYield;
    case "sentiment": return (r) => r.sentiment90d;
    case "ticker": return (r) => r.ticker;
  }
}

function parsePriceSource(dataQualityJson: string | null | undefined): string {
  if (!dataQualityJson) return "unknown";
  try {
    const parsed = JSON.parse(dataQualityJson) as {
      prices?: { source?: string } | null;
    };
    return parsed.prices?.source ?? "unknown";
  } catch {
    return "unknown";
  }
}
