import { prisma } from "@/lib/db/client";
import type { Rating } from "@/lib/db/json";
import {
  analyzePortfolio,
  type PortfolioAnalytics,
} from "@/lib/portfolio/analytics";

export interface WatchlistRow {
  ticker: string;
  name: string;
  sector: string;
  note: string | null;
  addedAt: string;
  overallScore: number | null;
  rating: Rating | null;
  rank: number | null;
  pe: number | null;
  fcfYield: number | null;
}

export interface PortfolioPositionRow {
  ticker: string;
  name: string;
  sector: string;
  weightPct: number;
  note: string | null;
  overallScore: number | null;
  valuationScore: number | null;
  riskScore: number | null;
  rating: Rating | null;
}

export interface PortfolioView {
  id: string;
  name: string;
  description: string | null;
  positions: PortfolioPositionRow[];
  analytics: PortfolioAnalytics;
}

/** Latest score per company id, shared by both tabs. */
async function latestScoresByCompany(): Promise<
  Map<string, { overall: number; valuation: number | null; risk: number | null; rating: Rating; rank: number | null }>
> {
  const latest = await prisma.scoreSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return new Map();
  const scores = await prisma.scoreSnapshot.findMany({
    where: { date: latest.date },
  });
  return new Map(
    scores.map((s) => [
      s.companyId,
      {
        overall: s.overallScore,
        valuation: s.valuationScore,
        risk: s.riskScore,
        rating: s.rating as Rating,
        rank: s.rank,
      },
    ]),
  );
}

export async function getWatchlist(): Promise<WatchlistRow[]> {
  const items = await prisma.watchlistItem.findMany({
    include: { company: true },
    orderBy: { addedAt: "desc" },
  });
  const scores = await latestScoresByCompany();
  const latestMetricDate = await prisma.metricSnapshot.findFirst({
    orderBy: { asOf: "desc" },
    select: { asOf: true },
  });
  const metrics = latestMetricDate
    ? await prisma.metricSnapshot.findMany({
        where: { asOf: latestMetricDate.asOf },
        select: { companyId: true, pe: true, fcfYield: true },
      })
    : [];
  const metricsByCompany = new Map(metrics.map((m) => [m.companyId, m]));

  return items.map((item) => {
    const score = scores.get(item.companyId);
    const metric = metricsByCompany.get(item.companyId);
    return {
      ticker: item.company.ticker,
      name: item.company.name,
      sector: item.company.sector,
      note: item.note,
      addedAt: item.addedAt.toISOString(),
      overallScore: score?.overall ?? null,
      rating: score?.rating ?? null,
      rank: score?.rank ?? null,
      pe: metric?.pe ?? null,
      fcfYield: metric?.fcfYield ?? null,
    };
  });
}

export async function getPortfolios(): Promise<PortfolioView[]> {
  const portfolios = await prisma.portfolio.findMany({
    include: { positions: { include: { company: true } } },
    orderBy: { createdAt: "asc" },
  });
  const scores = await latestScoresByCompany();

  return portfolios.map((p) => {
    const positions: PortfolioPositionRow[] = p.positions
      .map((pos) => {
        const score = scores.get(pos.companyId);
        return {
          ticker: pos.company.ticker,
          name: pos.company.name,
          sector: pos.company.sector,
          weightPct: pos.weightPct,
          note: pos.note,
          overallScore: score?.overall ?? null,
          valuationScore: score?.valuation ?? null,
          riskScore: score?.risk ?? null,
          rating: score?.rating ?? null,
        };
      })
      .sort((a, b) => b.weightPct - a.weightPct);

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      positions,
      analytics: analyzePortfolio(
        positions.map((pos) => ({
          ticker: pos.ticker,
          weightPct: pos.weightPct,
          sector: pos.sector,
          valuationScore: pos.valuationScore,
          riskScore: pos.riskScore,
          overallScore: pos.overallScore,
        })),
      ),
    };
  });
}
