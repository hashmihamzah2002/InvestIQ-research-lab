import { addDays, addMonths, isoDay, lastDayOfMonth, utcDate } from "@/lib/dates";
import {
  DEFAULT_REPORTING_LAG_DAYS,
  type DataQuality,
  type MetricsInput,
  type MetricsResult,
  type PePoint,
  type PricePoint,
  type StatementRow,
} from "./types";

/**
 * Derive point-in-time metrics from as-reported statements and prices.
 * As-of correctness: only statements publicly available by `asOf`
 * (reportedAt, or periodEnd + 45d when unknown) are used — this is what lets
 * the backtester call the same function historically without look-ahead.
 *
 * Conventions (documented on the Methodology page):
 *  - TTM flows = sum of the last 4 reported quarters; balance sheet = latest.
 *  - P/E = price / TTM diluted EPS, only when EPS > 0.
 *  - PEG = P/E / (100 x growth), growth = forward estimate else trailing EPS YoY.
 *  - EV = market cap + total debt - cash.
 *  - Returns use calendar windows with nearest-prior trading day.
 */
export function computeMetrics(input: MetricsInput): MetricsResult {
  const notes: string[] = [];
  const available = availableStatements(input.statements, input.asOf);
  const quarters = available
    .filter((s) => s.periodType === "QUARTERLY")
    .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
  const annuals = available
    .filter((s) => s.periodType === "ANNUAL")
    .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());

  const last4 = quarters.slice(-4);
  const prior4 = quarters.slice(-8, -4);
  const latest = quarters.at(-1) ?? annuals.at(-1) ?? null;
  const price = lastCloseOnOrBefore(input.prices, input.asOf);

  // --- TTM aggregates ---
  const ttm = {
    revenue: sumField(last4, "revenue"),
    grossProfit: sumField(last4, "grossProfit"),
    operatingIncome: sumField(last4, "operatingIncome"),
    netIncome: sumField(last4, "netIncome"),
    eps: sumField(last4, "eps"),
    ebitda: sumField(last4, "ebitda"),
    operatingCashFlow: sumField(last4, "operatingCashFlow"),
    capex: sumField(last4, "capex"),
    dividendsPaid: sumField(last4, "dividendsPaid"),
    interestExpense: sumField(last4, "interestExpense"),
  };
  const priorTtm = {
    revenue: sumField(prior4, "revenue"),
    eps: sumField(prior4, "eps"),
    operatingIncome: sumField(prior4, "operatingIncome"),
  };

  const sharesOut = latest?.sharesOut ?? null;
  const marketCap =
    price !== null && sharesOut !== null && sharesOut > 0
      ? price * sharesOut
      : null;

  // --- Margins ---
  const grossMargin = safeRatio(ttm.grossProfit, ttm.revenue);
  const operatingMargin = safeRatio(ttm.operatingIncome, ttm.revenue);
  const netMargin = safeRatio(ttm.netIncome, ttm.revenue);

  // --- Returns on capital (negative-equity guard) ---
  const equity = latest?.totalEquity ?? null;
  const yearAgoQuarter = quarters.at(-5) ?? null;
  const equityYearAgo = yearAgoQuarter?.totalEquity ?? null;
  let roe: number | null = null;
  if (ttm.netIncome !== null && equity !== null && equity > 0) {
    const avgEquity =
      equityYearAgo !== null && equityYearAgo > 0
        ? (equity + equityYearAgo) / 2
        : equity;
    roe = ttm.netIncome / avgEquity;
  } else if (equity !== null && equity <= 0) {
    notes.push("ROE not meaningful: negative or zero book equity (ROA shown instead).");
  }
  const roa = safeRatio(
    ttm.netIncome,
    latest?.totalAssets ?? null,
    { denominatorMustBePositive: true },
  );

  // --- Leverage & liquidity ---
  const totalDebt = latest?.totalDebt ?? null;
  const cash = latest?.cash ?? null;
  let debtToEquity: number | null = null;
  if (totalDebt !== null && equity !== null && equity > 0) {
    debtToEquity = totalDebt / equity;
  } else if (totalDebt !== null && equity !== null && equity <= 0) {
    notes.push("Debt/equity not meaningful with negative equity; see net debt / EBITDA.");
  }
  const netDebtToEbitda =
    totalDebt !== null && cash !== null && ttm.ebitda !== null && ttm.ebitda > 0
      ? (totalDebt - cash) / ttm.ebitda
      : null;
  const interestCoverage =
    ttm.operatingIncome !== null &&
    ttm.interestExpense !== null &&
    ttm.interestExpense > 0
      ? ttm.operatingIncome / ttm.interestExpense
      : null;
  const currentRatio = safeRatio(
    latest?.currentAssets ?? null,
    latest?.currentLiabilities ?? null,
    { denominatorMustBePositive: true },
  );

  // --- Growth ---
  const revenueGrowthYoY = growthRate(ttm.revenue, priorTtm.revenue);
  const epsGrowthYoY =
    ttm.eps !== null && priorTtm.eps !== null && priorTtm.eps > 0
      ? ttm.eps / priorTtm.eps - 1
      : null;
  const threeYearsAgo4 = quarters.slice(-16, -12);
  const ttmRevenue3yAgo = sumField(threeYearsAgo4, "revenue");
  const revenueCagr3y =
    ttm.revenue !== null &&
    ttmRevenue3yAgo !== null &&
    ttmRevenue3yAgo > 0 &&
    ttm.revenue > 0
      ? Math.pow(ttm.revenue / ttmRevenue3yAgo, 1 / 3) - 1
      : null;
  const priorOperatingMargin = safeRatio(priorTtm.operatingIncome, priorTtm.revenue);
  const marginExpansion =
    operatingMargin !== null && priorOperatingMargin !== null
      ? operatingMargin - priorOperatingMargin
      : null;

  // --- Valuation ---
  const pe = price !== null && ttm.eps !== null && ttm.eps > 0 ? price / ttm.eps : null;
  if (pe === null && ttm.eps !== null && ttm.eps <= 0) {
    notes.push("P/E unavailable: negative trailing-twelve-month earnings.");
  }
  const forwardPe = input.keyMetrics?.forwardPe ?? null;
  const forwardGrowth = input.keyMetrics?.forwardGrowth ?? null;
  const growthForPeg = forwardGrowth ?? epsGrowthYoY;
  const peg =
    pe !== null && growthForPeg !== null && growthForPeg > 0.005
      ? pe / (growthForPeg * 100)
      : null;
  const priceToSales = safeRatio(marketCap, ttm.revenue, {
    denominatorMustBePositive: true,
  });
  const ev =
    marketCap !== null && totalDebt !== null && cash !== null
      ? marketCap + totalDebt - cash
      : null;
  const evToEbitda =
    ev !== null && ttm.ebitda !== null && ttm.ebitda > 0 ? ev / ttm.ebitda : null;
  const fcf =
    ttm.operatingCashFlow !== null && ttm.capex !== null
      ? ttm.operatingCashFlow - ttm.capex
      : null;
  const fcfYield = safeRatio(fcf, marketCap, { denominatorMustBePositive: true });
  const dividendYield =
    safeRatio(ttm.dividendsPaid, marketCap, { denominatorMustBePositive: true }) ??
    input.keyMetrics?.dividendYield ??
    null;

  // --- Price performance ---
  const windows = [1, 3, 6, 12] as const;
  const stockReturns = windows.map((m) => windowReturn(input.prices, input.asOf, m));
  const indexReturns = windows.map((m) =>
    windowReturn(input.indexPrices, input.asOf, m),
  );
  const rel = stockReturns.map((r, i) =>
    r !== null && indexReturns[i] !== null ? r - indexReturns[i]! : null,
  );

  // --- Stability ---
  const earningsVolatility = epsGrowthVolatility(quarters);
  const fcfConsistency = computeFcfConsistency(quarters);

  const dataQuality: DataQuality = {
    prices:
      input.prices.length > 0
        ? {
            source: input.priceSource ?? "unknown",
            asOf: isoDay(input.prices.at(-1)!.date),
            bars: input.prices.length,
          }
        : null,
    fundamentals: latest
      ? {
          source: latest.source,
          latestPeriodEnd: isoDay(latest.periodEnd),
          quartersAvailable: quarters.length,
          annualsAvailable: annuals.length,
        }
      : null,
    keyMetrics: input.keyMetrics ? { source: input.keyMetrics.source } : null,
    notes,
  };

  return {
    price,
    marketCap,
    pe: roundOrNull(pe, 2),
    forwardPe: roundOrNull(forwardPe, 2),
    peg: roundOrNull(peg, 2),
    evToEbitda: roundOrNull(evToEbitda, 2),
    priceToSales: roundOrNull(priceToSales, 2),
    fcfYield: roundOrNull(fcfYield, 4),
    dividendYield: roundOrNull(dividendYield, 4),
    grossMargin: roundOrNull(grossMargin, 4),
    operatingMargin: roundOrNull(operatingMargin, 4),
    netMargin: roundOrNull(netMargin, 4),
    roe: roundOrNull(roe, 4),
    roa: roundOrNull(roa, 4),
    debtToEquity: roundOrNull(debtToEquity, 2),
    netDebtToEbitda: roundOrNull(netDebtToEbitda, 2),
    interestCoverage: roundOrNull(interestCoverage, 2),
    currentRatio: roundOrNull(currentRatio, 2),
    revenueGrowthYoY: roundOrNull(revenueGrowthYoY, 4),
    revenueCagr3y: roundOrNull(revenueCagr3y, 4),
    epsGrowthYoY: roundOrNull(epsGrowthYoY, 4),
    forwardGrowth: roundOrNull(forwardGrowth, 4),
    epsRevisionTrend: input.keyMetrics?.epsRevisionTrend ?? null,
    marginExpansion: roundOrNull(marginExpansion, 4),
    return1m: roundOrNull(stockReturns[0], 4),
    return3m: roundOrNull(stockReturns[1], 4),
    return6m: roundOrNull(stockReturns[2], 4),
    return12m: roundOrNull(stockReturns[3], 4),
    relReturn1m: roundOrNull(rel[0], 4),
    relReturn3m: roundOrNull(rel[1], 4),
    relReturn6m: roundOrNull(rel[2], 4),
    relReturn12m: roundOrNull(rel[3], 4),
    earningsVolatility: roundOrNull(earningsVolatility, 4),
    fcfConsistency: roundOrNull(fcfConsistency, 4),
    sentiment90d: roundOrNull(input.newsSentiment90d ?? null, 4),
    peHistory: computePeHistory(input.prices, quarters, input.asOf),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Helpers (exported for targeted unit tests)
// ---------------------------------------------------------------------------

export function availableStatements(
  statements: StatementRow[],
  asOf: Date,
): StatementRow[] {
  return statements.filter((s) => {
    const publicAt =
      s.reportedAt ?? addDays(s.periodEnd, DEFAULT_REPORTING_LAG_DAYS);
    return publicAt.getTime() <= asOf.getTime();
  });
}

function sumField(
  rows: StatementRow[],
  field: keyof Pick<
    StatementRow,
    | "revenue" | "grossProfit" | "operatingIncome" | "netIncome" | "eps"
    | "ebitda" | "operatingCashFlow" | "capex" | "dividendsPaid" | "interestExpense"
  >,
): number | null {
  if (rows.length < 4) return null; // TTM requires a full year of quarters
  let sum = 0;
  for (const row of rows) {
    const v = row[field];
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

function safeRatio(
  numerator: number | null,
  denominator: number | null,
  opts: { denominatorMustBePositive?: boolean } = {},
): number | null {
  if (numerator === null || denominator === null) return null;
  if (opts.denominatorMustBePositive && denominator <= 0) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

function growthRate(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior <= 0) return null;
  return current / prior - 1;
}

/** Last close on or before the target date (binary search). */
export function lastCloseOnOrBefore(
  prices: PricePoint[],
  target: Date,
): number | null {
  const idx = lastIndexOnOrBefore(prices, target);
  return idx === -1 ? null : prices[idx].close;
}

function lastIndexOnOrBefore(prices: PricePoint[], target: Date): number {
  let lo = 0;
  let hi = prices.length - 1;
  let ans = -1;
  const t = target.getTime();
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].date.getTime() <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Calendar-month window return ending at asOf; null if history is short. */
export function windowReturn(
  prices: PricePoint[],
  asOf: Date,
  months: number,
): number | null {
  if (prices.length === 0) return null;
  const endIdx = lastIndexOnOrBefore(prices, asOf);
  if (endIdx === -1) return null;
  const startTarget = addMonths(asOf, -months);
  const startIdx = lastIndexOnOrBefore(prices, startTarget);
  if (startIdx === -1) return null;
  // Guard against a start bar that is far older than the window (thin data).
  const gapDays =
    (startTarget.getTime() - prices[startIdx].date.getTime()) / 86_400_000;
  if (gapDays > 21) return null;
  const start = prices[startIdx].close;
  const end = prices[endIdx].close;
  if (start <= 0) return null;
  return end / start - 1;
}

/** Stdev of quarterly YoY EPS growth over the last 8 comparable quarters. */
export function epsGrowthVolatility(quarters: StatementRow[]): number | null {
  const growths: number[] = [];
  for (let i = quarters.length - 1; i >= 4 && growths.length < 8; i--) {
    const cur = quarters[i].eps;
    const prior = quarters[i - 4].eps;
    if (cur === null || prior === null || prior <= 0) continue;
    growths.push(cur / prior - 1);
  }
  if (growths.length < 4) return null;
  const mean = growths.reduce((a, b) => a + b, 0) / growths.length;
  const variance =
    growths.reduce((acc, g) => acc + (g - mean) ** 2, 0) / growths.length;
  return Math.sqrt(variance);
}

/** Share of the last (up to) 8 quarters with positive free cash flow. */
export function computeFcfConsistency(quarters: StatementRow[]): number | null {
  const recent = quarters.slice(-8);
  const usable = recent.filter(
    (q) => q.operatingCashFlow !== null && q.capex !== null,
  );
  if (usable.length < 4) return null;
  const positive = usable.filter(
    (q) => q.operatingCashFlow! - q.capex! > 0,
  ).length;
  return positive / usable.length;
}

/** Monthly trailing-P/E series over the last 36 month-ends. */
export function computePeHistory(
  prices: PricePoint[],
  quarters: StatementRow[],
  asOf: Date,
  monthsBack = 36,
): PePoint[] {
  if (prices.length === 0) return [];
  const points: PePoint[] = [];
  for (let m = monthsBack - 1; m >= 0; m--) {
    const ref = addMonths(asOf, -m);
    const monthEnd = utcDate(
      ref.getUTCFullYear(),
      ref.getUTCMonth() + 1,
      lastDayOfMonth(ref.getUTCFullYear(), ref.getUTCMonth() + 1),
    );
    const effective = monthEnd.getTime() > asOf.getTime() ? asOf : monthEnd;
    const close = lastCloseOnOrBefore(prices, effective);
    if (close === null) {
      points.push({ date: isoDay(effective), pe: null });
      continue;
    }
    const known = availableStatements(quarters, effective).filter(
      (q) => q.periodType === "QUARTERLY",
    );
    const last4 = known.slice(-4);
    let eps: number | null = null;
    if (last4.length === 4 && last4.every((q) => q.eps !== null)) {
      eps = last4.reduce((acc, q) => acc + q.eps!, 0);
    }
    points.push({
      date: isoDay(effective),
      pe: eps !== null && eps > 0 ? Math.round((close / eps) * 100) / 100 : null,
    });
  }
  return points;
}

function roundOrNull(value: number | null, decimals: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
