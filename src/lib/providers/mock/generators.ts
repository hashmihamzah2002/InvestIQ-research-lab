import {
  addDays,
  isoDay,
  isWeekend,
  lastDayOfMonth,
  utcDate,
} from "@/lib/dates";
import type {
  FilingDTO,
  KeyMetricsDTO,
  MacroObservationDTO,
  NewsItemDTO,
  PriceBarDTO,
  StatementPeriodDTO,
} from "@/lib/providers/types";
import type { MockProfile } from "./profile";
import { SeededRng } from "./prng";

/**
 * Deterministic generators behind the mock providers. Two rules keep output
 * stable as time passes:
 *  1. Histories are anchored at a FIXED epoch (SERIES_START / ipoDate), never
 *     "N years before today" — yesterday's bar never changes when you rerun.
 *  2. Per-item noise is seeded by (ticker, date), never by sequence position
 *     within a sliding window.
 */
export const SERIES_START = utcDate(2020, 1, 6); // first Monday of 2020
const TRADING_DAYS_PER_YEAR = 252;
const DEBT_INTEREST_RATE = 0.045;
const QUARTER_SEASONALITY = [0.96, 0.99, 1.01, 1.04] as const;
/** Days after period end when mock financials become public. */
export const MOCK_REPORTING_LAG_DAYS = { QUARTERLY: 35, ANNUAL: 55 } as const;

function seriesStartFor(profile: MockProfile): Date {
  if (!profile.ipoDate) return SERIES_START;
  const [y, m, d] = profile.ipoDate.split("-").map(Number);
  return utcDate(y, m, d);
}

// ---------------------------------------------------------------------------
// Prices — geometric Brownian motion over weekdays
// ---------------------------------------------------------------------------

export function generateDailyPrices(
  ticker: string,
  profile: MockProfile,
  range: { from: Date; to: Date },
): PriceBarDTO[] {
  const start = seriesStartFor(profile);
  if (range.to.getTime() < start.getTime()) return [];

  const rng = new SeededRng(`${ticker}:prices`);
  const dt = 1 / TRADING_DAYS_PER_YEAR;
  const driftTerm = (profile.drift - 0.5 * profile.vol * profile.vol) * dt;
  const volTerm = profile.vol * Math.sqrt(dt);
  const baseVolume = profile.sharesOut * 0.008;

  const bars: PriceBarDTO[] = [];
  let price = profile.startPrice;
  let prevClose = profile.startPrice;

  for (
    let day = start;
    day.getTime() <= range.to.getTime();
    day = addDays(day, 1)
  ) {
    if (isWeekend(day)) continue;
    price = price * Math.exp(driftTerm + volTerm * rng.gaussian());
    // Intraday shape from per-day seeded noise (stable under window slides).
    const dayRng = new SeededRng(`${ticker}:bar:${isoDay(day)}`);
    const open = prevClose * (1 + dayRng.gaussian(0, 0.004));
    const close = price;
    const spread = Math.abs(dayRng.gaussian(0, 0.008));
    const high = Math.max(open, close) * (1 + spread);
    const low = Math.min(open, close) * (1 - spread);
    const volume = Math.round(
      baseVolume * Math.exp(dayRng.gaussian(0, 0.35)),
    );
    if (day.getTime() >= range.from.getTime()) {
      bars.push({
        date: day,
        open: round2(open),
        high: round2(high),
        low: round2(low),
        close: round2(close),
        adjClose: round2(close),
        volume,
      });
    }
    prevClose = close;
  }
  return bars;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Fundamentals — quarterly statements + annual aggregates
// ---------------------------------------------------------------------------

interface QuarterRow extends StatementPeriodDTO {
  periodType: "QUARTERLY";
}

export function generateFundamentals(
  ticker: string,
  profile: MockProfile,
  asOf: Date,
): StatementPeriodDTO[] {
  const start = seriesStartFor(profile);
  const quarters: QuarterRow[] = [];

  // Quarter ends from the first after series start to the last already
  // "reported" by asOf.
  let q = 0;
  for (let year = start.getUTCFullYear(); year <= asOf.getUTCFullYear(); year++) {
    for (let month = 3; month <= 12; month += 3) {
      const periodEnd = utcDate(year, month, lastDayOfMonth(year, month));
      if (periodEnd.getTime() < start.getTime()) continue;
      const reportedAt = addDays(periodEnd, MOCK_REPORTING_LAG_DAYS.QUARTERLY);
      if (reportedAt.getTime() > asOf.getTime()) break;

      const yearsElapsed = q / 4;
      const rng = new SeededRng(`${ticker}:fund:${isoDay(periodEnd)}`);
      const noise = profile.fundamentalsNoise;

      const revenue =
        (profile.baseRevenue / 4) *
        Math.pow(1 + profile.revenueGrowth, yearsElapsed) *
        QUARTER_SEASONALITY[(month / 3 - 1) as 0 | 1 | 2 | 3] *
        Math.max(0.3, 1 + rng.gaussian(0, noise * 0.5));
      const annualizedRevenue = revenue * 4;

      const gm =
        profile.grossMargin === null
          ? null
          : clamp(profile.grossMargin + rng.gaussian(0, noise * 0.1), 0.02, 0.95);
      const om = clamp(
        profile.operatingMargin +
          profile.marginTrend * yearsElapsed +
          rng.gaussian(0, noise * 0.3),
        -0.4,
        0.9,
      );

      const operatingIncome = revenue * om;
      const totalEquity = profile.equityPctRevenue * annualizedRevenue;
      const totalDebt = profile.debtToEquity * Math.abs(totalEquity);
      const interestExpense = (totalDebt * DEBT_INTEREST_RATE) / 4;
      const pretax = operatingIncome - interestExpense;
      const netIncome = pretax * (1 - profile.taxRate);
      const da = profile.capexPctRevenue * revenue * 0.85;
      const capex = profile.capexPctRevenue * revenue;
      const operatingCashFlow =
        netIncome + da + revenue * rng.gaussian(0, noise * 0.15);
      const cash = profile.cashPctRevenue * annualizedRevenue;
      const otherLiabilities = 0.15 * annualizedRevenue;
      const totalLiabilities = totalDebt + otherLiabilities;

      quarters.push({
        periodEnd,
        periodType: "QUARTERLY",
        revenue: round0(revenue),
        grossProfit: gm === null ? null : round0(revenue * gm),
        operatingIncome: round0(operatingIncome),
        netIncome: round0(netIncome),
        eps: round4(netIncome / profile.sharesOut),
        sharesOut: profile.sharesOut,
        totalAssets: round0(totalLiabilities + totalEquity),
        totalLiabilities: round0(totalLiabilities),
        totalEquity: round0(totalEquity),
        cash: round0(cash),
        totalDebt: round0(totalDebt),
        currentAssets: round0(cash + 0.12 * annualizedRevenue),
        currentLiabilities: round0(0.1 * annualizedRevenue + 0.08 * totalDebt),
        ebitda: round0(operatingIncome + da),
        operatingCashFlow: round0(operatingCashFlow),
        capex: round0(capex),
        dividendsPaid: round0(Math.max(0, netIncome * profile.dividendPayout)),
        interestExpense: round0(interestExpense),
        reportedAt,
      });
      q++;
    }
  }

  // Annual aggregates for each complete calendar year (sum of flows, year-end
  // balance sheet) — consistent with the quarters by construction.
  const annuals: StatementPeriodDTO[] = [];
  const byYear = new Map<number, QuarterRow[]>();
  for (const row of quarters) {
    const y = row.periodEnd.getUTCFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), row]);
  }
  for (const rows of byYear.values()) {
    if (rows.length !== 4) continue;
    const q4 = rows[3];
    const sum = (f: (r: QuarterRow) => number | null | undefined): number =>
      round0(rows.reduce((acc, r) => acc + (f(r) ?? 0), 0));
    const hasGross = rows.every((r) => r.grossProfit !== null);
    annuals.push({
      periodEnd: q4.periodEnd,
      periodType: "ANNUAL",
      revenue: sum((r) => r.revenue),
      grossProfit: hasGross ? sum((r) => r.grossProfit) : null,
      operatingIncome: sum((r) => r.operatingIncome),
      netIncome: sum((r) => r.netIncome),
      eps: round4(rows.reduce((acc, r) => acc + (r.eps ?? 0), 0)),
      sharesOut: q4.sharesOut,
      totalAssets: q4.totalAssets,
      totalLiabilities: q4.totalLiabilities,
      totalEquity: q4.totalEquity,
      cash: q4.cash,
      totalDebt: q4.totalDebt,
      currentAssets: q4.currentAssets,
      currentLiabilities: q4.currentLiabilities,
      ebitda: sum((r) => r.ebitda),
      operatingCashFlow: sum((r) => r.operatingCashFlow),
      capex: sum((r) => r.capex),
      dividendsPaid: sum((r) => r.dividendsPaid),
      interestExpense: sum((r) => r.interestExpense),
      reportedAt: addDays(q4.periodEnd, MOCK_REPORTING_LAG_DAYS.ANNUAL),
    });
  }

  return [...quarters, ...annuals].sort(
    (a, b) => a.periodEnd.getTime() - b.periodEnd.getTime(),
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round0(n: number): number {
  return Math.round(n);
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Key metrics (forward-looking)
// ---------------------------------------------------------------------------

export function generateKeyMetrics(
  ticker: string,
  profile: MockProfile,
  asOf: Date,
): KeyMetricsDTO {
  // Re-derive the inputs from the same deterministic sources.
  const bars = generateDailyPrices(ticker, profile, {
    from: addDays(asOf, -7),
    to: asOf,
  });
  const lastClose = bars.at(-1)?.close;
  const statements = generateFundamentals(ticker, profile, asOf);
  const recentQuarters = statements
    .filter((s) => s.periodType === "QUARTERLY")
    .slice(-4);
  const ttmEps = recentQuarters.reduce((acc, r) => acc + (r.eps ?? 0), 0);
  const ttmDividends = recentQuarters.reduce(
    (acc, r) => acc + (r.dividendsPaid ?? 0),
    0,
  );

  // Quarterly-stable seed: estimates shift each quarter, not each day.
  const quarterKey = `${asOf.getUTCFullYear()}Q${Math.floor(asOf.getUTCMonth() / 3) + 1}`;
  const rng = new SeededRng(`${ticker}:keymetrics:${quarterKey}`);

  const forwardGrowth = profile.revenueGrowth * rng.range(0.75, 1.15);
  const forwardEpsGrowth = forwardGrowth + profile.marginTrend * 2;
  const forwardPe =
    lastClose !== undefined && ttmEps > 0
      ? round2(lastClose / (ttmEps * (1 + forwardEpsGrowth)))
      : null;
  const dividendYield =
    lastClose !== undefined && ttmDividends > 0
      ? round4(ttmDividends / (lastClose * profile.sharesOut))
      : null;

  return {
    forwardPe,
    forwardGrowth: round4(forwardGrowth),
    epsRevisionTrend: round4(
      clamp(rng.gaussian(Math.sign(profile.marginTrend) * 0.2, 0.35), -1, 1),
    ),
    dividendYield,
  };
}

// ---------------------------------------------------------------------------
// Filings — neutral cadence only. The mock NEVER fabricates negative
// regulatory events (restatements, late filings) for real companies; red-flag
// paths are exercised via test fixtures and CSV imports instead.
// ---------------------------------------------------------------------------

const EIGHT_K_TITLES = [
  "Results of Operations and Financial Condition (Item 2.02)",
  "Regulation FD Disclosure (Item 7.01)",
  "Submission of Matters to a Vote of Security Holders (Item 5.07)",
  "Other Events (Item 8.01)",
] as const;

export function generateFilings(
  ticker: string,
  profile: MockProfile,
  country: string,
  since: Date,
  asOf: Date,
): FilingDTO[] {
  const start = seriesStartFor(profile);
  const isCanadian = country === "CA";
  const filings: FilingDTO[] = [];

  for (let year = start.getUTCFullYear(); year <= asOf.getUTCFullYear(); year++) {
    const yearRng = new SeededRng(`${ticker}:filings:${year}`);
    const push = (form: string, filedAt: Date, title: string) => {
      if (filedAt.getTime() < since.getTime()) return;
      if (filedAt.getTime() > asOf.getTime()) return;
      if (filedAt.getTime() < start.getTime()) return;
      const accessionNo = `mock-${ticker.toLowerCase()}-${isoDay(filedAt)}-${form.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      filings.push({
        accessionNo,
        form,
        filedAt,
        title,
        url: `https://example.com/mock-filings/${ticker}/${accessionNo}`,
        flags: [],
      });
    };

    if (isCanadian) {
      // MJDS filers: 40-F annual report + quarterly 6-K furnishings.
      push(
        "40-F",
        utcDate(year, 3, 18 + yearRng.int(0, 4)),
        `Annual report (fiscal year ${year - 1})`,
      );
      for (const month of [5, 8, 11]) {
        push("6-K", utcDate(year, month, 8 + yearRng.int(0, 4)), "Interim report");
      }
    } else {
      push(
        "10-K",
        utcDate(year, 2, 18 + yearRng.int(0, 6)),
        `Annual report (fiscal year ${year - 1})`,
      );
      for (const month of [5, 8, 11]) {
        push(
          "10-Q",
          utcDate(year, month, 3 + yearRng.int(0, 5)),
          "Quarterly report",
        );
      }
    }
    const eightKCount = yearRng.int(3, 6);
    for (let i = 0; i < eightKCount; i++) {
      const month = yearRng.int(1, 12);
      const day = yearRng.int(1, lastDayOfMonth(year, month));
      push(
        isCanadian ? "6-K" : "8-K",
        utcDate(year, month, day),
        yearRng.pick(EIGHT_K_TITLES),
      );
    }
  }

  return filings
    .sort((a, b) => b.filedAt.getTime() - a.filedAt.getTime())
    .filter(
      // De-duplicate accession numbers (two 8-Ks could land on one day).
      (f, idx, arr) => arr.findIndex((g) => g.accessionNo === f.accessionNo) === idx,
    );
}

// ---------------------------------------------------------------------------
// News — generic neutral headlines with a slow-moving sentiment signal.
// ---------------------------------------------------------------------------

const NEWS_TEMPLATES = [
  "{T} quarterly results review",
  "{T}: segment performance update",
  "Analyst day recap: {T}",
  "{T} capital allocation notes",
  "Industry outlook: {S} demand check-in",
  "{T} product roadmap roundup",
  "{T} supply chain commentary",
  "Valuation check: where {T} trades versus peers",
] as const;

export function generateNews(
  ticker: string,
  profile: MockProfile,
  sector: string,
  since: Date,
  asOf: Date,
): NewsItemDTO[] {
  const start = seriesStartFor(profile);
  const items: NewsItemDTO[] = [];
  const effectiveSince = since.getTime() > start.getTime() ? since : start;

  for (
    let day = effectiveSince;
    day.getTime() <= asOf.getTime();
    day = addDays(day, 1)
  ) {
    const dayRng = new SeededRng(`${ticker}:news:${isoDay(day)}`);
    if (dayRng.next() > 0.18) continue; // ~1.3 items/week

    const monthKey = isoDay(day).slice(0, 7);
    const monthRng = new SeededRng(`${ticker}:sentiment:${monthKey}`);
    const monthlyBase = clamp(
      monthRng.gaussian(Math.sign(profile.drift) * 0.15, 0.25),
      -0.6,
      0.6,
    );
    const sentiment = round4(clamp(monthlyBase + dayRng.gaussian(0, 0.15), -0.9, 0.9));

    const template = dayRng.pick(NEWS_TEMPLATES);
    const title = template.replace("{T}", ticker).replace("{S}", sector);
    items.push({
      publishedAt: day,
      title,
      url: `https://example.com/mock-news/${ticker}/${isoDay(day)}`,
      source: "Mock Research Wire",
      summary: `Illustrative research snippet about ${ticker} generated for demonstration. Sentiment score ${sentiment >= 0 ? "+" : ""}${sentiment.toFixed(2)}.`,
      sentiment,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Macro — piecewise-linear anchor curves shaped like recent history, plus
// small deterministic noise. Monthly observations dated first-of-month
// (FRED convention); GDP growth is quarterly.
// ---------------------------------------------------------------------------

type AnchorPoint = readonly [isoMonth: string, value: number];

const MACRO_ANCHORS: Record<string, readonly AnchorPoint[]> = {
  FEDFUNDS: [
    ["2020-01", 1.55],
    ["2020-04", 0.05],
    ["2022-01", 0.08],
    ["2022-12", 4.33],
    ["2023-08", 5.33],
    ["2024-09", 4.83],
    ["2025-06", 3.9],
    ["2026-06", 3.65],
  ],
  CPI_YOY: [
    ["2020-01", 2.5],
    ["2020-05", 0.2],
    ["2021-06", 5.4],
    ["2022-06", 9.0],
    ["2023-06", 3.0],
    ["2024-09", 2.4],
    ["2025-12", 2.5],
    ["2026-06", 2.4],
  ],
  UNRATE: [
    ["2020-01", 3.5],
    ["2020-04", 14.7],
    ["2021-12", 3.9],
    ["2023-04", 3.4],
    ["2024-12", 4.1],
    ["2026-06", 4.3],
  ],
  GDP_GROWTH: [
    ["2020-04", -7.5],
    ["2021-04", 11.9],
    ["2022-10", 1.0],
    ["2023-10", 3.1],
    ["2024-10", 2.5],
    ["2026-04", 2.0],
  ],
  DGS10: [
    ["2020-01", 1.8],
    ["2020-08", 0.55],
    ["2022-10", 4.2],
    ["2023-10", 4.9],
    ["2024-09", 3.7],
    ["2025-06", 4.3],
    ["2026-06", 4.2],
  ],
  DGS2: [
    ["2020-01", 1.6],
    ["2021-01", 0.12],
    ["2023-07", 5.0],
    ["2024-09", 3.6],
    ["2026-06", 3.8],
  ],
};

function monthIndex(isoMonth: string): number {
  const [y, m] = isoMonth.split("-").map(Number);
  return y * 12 + (m - 1);
}

function interpolateAnchors(
  anchors: readonly AnchorPoint[],
  targetMonthIdx: number,
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (targetMonthIdx <= monthIndex(first[0])) return first[1];
  if (targetMonthIdx >= monthIndex(last[0])) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ai = monthIndex(a[0]);
    const bi = monthIndex(b[0]);
    if (targetMonthIdx >= ai && targetMonthIdx <= bi) {
      const t = bi === ai ? 0 : (targetMonthIdx - ai) / (bi - ai);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return last[1];
}

export const MOCK_MACRO_SERIES = [...Object.keys(MACRO_ANCHORS), "T10Y2Y"];

export function generateMacroSeries(
  seriesId: string,
  since: Date,
  asOf: Date,
): MacroObservationDTO[] {
  const quarterly = seriesId === "GDP_GROWTH";
  const stepMonths = quarterly ? 3 : 1;
  const startIdx = Math.max(
    monthIndex("2020-01"),
    since.getUTCFullYear() * 12 + since.getUTCMonth(),
  );
  const endIdx = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();

  const out: MacroObservationDTO[] = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const month = (idx % 12) + 1;
    if (quarterly && (month - 1) % 3 !== 0) continue;
    if (!quarterly && stepMonths !== 1) continue;
    const year = Math.floor(idx / 12);
    const date = utcDate(year, month, 1);
    if (date.getTime() < since.getTime() || date.getTime() > asOf.getTime()) continue;

    let value: number;
    if (seriesId === "T10Y2Y") {
      value =
        interpolateAnchors(MACRO_ANCHORS.DGS10, idx) -
        interpolateAnchors(MACRO_ANCHORS.DGS2, idx);
    } else {
      const anchors = MACRO_ANCHORS[seriesId];
      if (!anchors) return [];
      value = interpolateAnchors(anchors, idx);
    }
    const noiseRng = new SeededRng(`macro:${seriesId}:${year}-${month}`);
    value += noiseRng.gaussian(0, 0.04);
    out.push({ date, value: Math.round(value * 100) / 100 });
  }
  return out;
}
