import { prisma } from "@/lib/db/client";
import { addDays } from "@/lib/dates";
import { parseJsonColumn, type Rating } from "@/lib/db/json";
import { z } from "zod";

export interface RankedStock {
  ticker: string;
  name: string;
  sector: string;
  overallScore: number;
  rating: Rating;
  rank: number | null;
  valuationScore: number | null;
  momentumScore: number | null;
  delta: number | null; // overall change vs previous snapshot date
}

export interface MacroTile {
  seriesId: string;
  name: string;
  unit: string;
  latest: { date: string; value: number } | null;
  previous: { date: string; value: number } | null;
  source: string | null;
}

export interface AlertItem {
  kind: "filing" | "news";
  ticker: string;
  date: string;
  title: string;
  url: string;
  detail: string | null;
  flags: string[];
  sentiment: number | null;
  source: string;
}

export interface DashboardData {
  asOf: string | null;
  indexCard: {
    lastClose: number;
    date: string;
    return3m: number | null;
    source: string;
  } | null;
  macro: MacroTile[];
  topRanked: RankedStock[];
  valuationRisks: RankedStock[];
  improving: RankedStock[];
  weakMomentum: RankedStock[];
  alerts: AlertItem[];
}

const FlagsSchema = z.array(z.string());

export async function getDashboardData(): Promise<DashboardData> {
  const latest = await prisma.scoreSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) {
    return {
      asOf: null,
      indexCard: null,
      macro: [],
      topRanked: [],
      valuationRisks: [],
      improving: [],
      weakMomentum: [],
      alerts: [],
    };
  }

  const scores = await prisma.scoreSnapshot.findMany({
    where: { date: latest.date },
    include: { company: { select: { ticker: true, name: true, sector: true } } },
  });

  // Previous snapshot date (for "improving fundamentals" deltas).
  const prevDate = await prisma.scoreSnapshot.findFirst({
    where: { date: { lt: latest.date } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const prevScores = prevDate
    ? await prisma.scoreSnapshot.findMany({
        where: { date: prevDate.date },
        select: { companyId: true, overallScore: true },
      })
    : [];
  const prevByCompany = new Map(prevScores.map((p) => [p.companyId, p.overallScore]));

  const ranked: RankedStock[] = scores.map((s) => ({
    ticker: s.company.ticker,
    name: s.company.name,
    sector: s.company.sector,
    overallScore: s.overallScore,
    rating: s.rating as Rating,
    rank: s.rank,
    valuationScore: s.valuationScore,
    momentumScore: s.momentumScore,
    delta: prevByCompany.has(s.companyId)
      ? Math.round((s.overallScore - prevByCompany.get(s.companyId)!) * 100) / 100
      : null,
  }));

  const topRanked = [...ranked]
    .filter((r) => r.rank !== null)
    .sort((a, b) => a.rank! - b.rank!)
    .slice(0, 5);
  const valuationRisks = [...ranked]
    .filter((r) => r.valuationScore !== null)
    .sort((a, b) => a.valuationScore! - b.valuationScore!)
    .slice(0, 5);
  const weakMomentum = [...ranked]
    .filter((r) => r.momentumScore !== null)
    .sort((a, b) => a.momentumScore! - b.momentumScore!)
    .slice(0, 5);
  const improving = [...ranked]
    .filter((r) => r.delta !== null && r.delta > 0)
    .sort((a, b) => b.delta! - a.delta!)
    .slice(0, 5);

  // --- Index card (SPY) ---
  const spy = await prisma.company.findUnique({ where: { ticker: "SPY" } });
  let indexCard: DashboardData["indexCard"] = null;
  if (spy) {
    const lastBar = await prisma.priceBar.findFirst({
      where: { companyId: spy.id },
      orderBy: { date: "desc" },
    });
    if (lastBar) {
      const threeMonthsAgo = await prisma.priceBar.findFirst({
        where: { companyId: spy.id, date: { lte: addDays(lastBar.date, -91) } },
        orderBy: { date: "desc" },
      });
      indexCard = {
        lastClose: lastBar.close,
        date: lastBar.date.toISOString(),
        return3m: threeMonthsAgo
          ? Math.round((lastBar.close / threeMonthsAgo.close - 1) * 10000) / 10000
          : null,
        source: lastBar.source,
      };
    }
  }

  // --- Macro tiles ---
  const indicators = await prisma.macroIndicator.findMany({
    orderBy: { seriesId: "asc" },
  });
  const macro: MacroTile[] = [];
  for (const ind of indicators) {
    const [latestObs, prevObs] = await prisma.macroObservation.findMany({
      where: { indicatorId: ind.id },
      orderBy: { date: "desc" },
      take: 2,
    });
    macro.push({
      seriesId: ind.seriesId,
      name: ind.name,
      unit: ind.unit,
      latest: latestObs
        ? { date: latestObs.date.toISOString(), value: latestObs.value }
        : null,
      previous: prevObs
        ? { date: prevObs.date.toISOString(), value: prevObs.value }
        : null,
      source: latestObs?.source ?? null,
    });
  }

  // --- Alerts: flagged/major filings + strongly-toned news, last 14 days ---
  const since = addDays(latest.date, -14);
  const recentFilings = await prisma.filing.findMany({
    where: { filedAt: { gte: since } },
    include: { company: { select: { ticker: true } } },
    orderBy: { filedAt: "desc" },
    take: 40,
  });
  const filingAlerts: AlertItem[] = recentFilings
    .map((f) => ({
      kind: "filing" as const,
      ticker: f.company.ticker,
      date: f.filedAt.toISOString(),
      title: `${f.form}: ${f.title ?? "filing"}`,
      url: f.url,
      detail: null,
      flags: parseJsonColumn(FlagsSchema, f.flagsJson, [], "filing.flags"),
      sentiment: null,
      source: f.source,
    }))
    .filter((f) => f.flags.length > 0 || /^(10-K|10-Q|40-F|8-K)$/.test(f.title.split(":")[0]))
    .slice(0, 6);

  const strongNews = await prisma.newsItem.findMany({
    where: {
      publishedAt: { gte: since },
      OR: [{ sentiment: { lte: -0.4 } }, { sentiment: { gte: 0.55 } }],
    },
    include: { company: { select: { ticker: true } } },
    orderBy: { publishedAt: "desc" },
    take: 6,
  });
  const newsAlerts: AlertItem[] = strongNews.map((n) => ({
    kind: "news" as const,
    ticker: n.company.ticker,
    date: n.publishedAt.toISOString(),
    title: n.title,
    url: n.url,
    detail: n.summary,
    flags: [],
    sentiment: n.sentiment,
    source: n.provider,
  }));

  const alerts = [...filingAlerts, ...newsAlerts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return {
    asOf: latest.date.toISOString(),
    indexCard,
    macro,
    topRanked,
    valuationRisks,
    improving,
    weakMomentum,
    alerts,
  };
}
