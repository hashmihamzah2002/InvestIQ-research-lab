import { isoDay } from "@/lib/dates";

/**
 * Pure backtest engine. Takes pre-resolved inputs (trading days, forward-
 * filled prices, a rank provider) and simulates a top-N equal-weight
 * strategy with periodic rebalancing and transaction costs.
 *
 * Deliberate simplifications (surfaced in LIMITATIONS and the UI):
 *  - fills at the daily close of the rebalance day, no slippage model;
 *  - equal weights at rebalance, drifting freely in between;
 *  - benchmark is frictionless buy-and-hold;
 *  - Sharpe uses a 0% cash-rate assumption.
 */
export type BacktestStrategy =
  | "overall"
  | "valuation"
  | "quality"
  | "growth"
  | "momentum"
  | "risk";

export interface BacktestParams {
  strategy: BacktestStrategy;
  topN: number;
  rebalance: "monthly" | "quarterly";
  /** Cost in basis points applied to every dollar traded. */
  txnCostBps: number;
  start: Date;
  end: Date;
}

export interface BacktestInputs {
  /** Ascending trading days (typically the benchmark's calendar). */
  tradingDays: Date[];
  /** ticker -> isoDay -> close, forward-filled onto tradingDays. */
  prices: Map<string, Map<string, number>>;
  /** isoDay -> benchmark close (same calendar). */
  benchmark: Map<string, number>;
  /**
   * Scores as of a date (no look-ahead — implementations must only use
   * information public by that date). Higher score = better.
   */
  ranksAt: (date: Date) => { ticker: string; score: number }[];
}

export interface RebalanceEvent {
  date: string;
  tickers: string[];
  /** Fraction of portfolio value traded (one-way, 0..~2 incl. first buy). */
  turnover: number;
  costPaid: number; // in portfolio-value units (start = 1.0)
}

export interface BacktestResult {
  points: { date: string; strategy: number; benchmark: number }[];
  rebalances: RebalanceEvent[];
  stats: {
    totalReturn: number;
    cagr: number | null;
    volatility: number | null;
    maxDrawdown: number;
    sharpe: number | null;
    benchmarkTotalReturn: number;
    benchmarkCagr: number | null;
    benchmarkMaxDrawdown: number;
    avgTurnover: number;
    totalCostPaid: number;
    tradingDays: number;
  };
  limitations: string[];
}

export const BACKTEST_LIMITATIONS: string[] = [
  "Educational mechanics demo — with mock data it shows how the strategy logic behaves, not how markets behaved.",
  "Fixed 30-company universe chosen in hindsight: survivorship and selection bias are built in.",
  "Fundamentals enter with a reporting lag (reportedAt or +45 days), but provider estimates (forward P/E, revisions) are unavailable historically, so those factors are simply missing in-sample.",
  "Fills at the close with a flat per-trade cost; no slippage, spreads, market impact, taxes, or borrowing costs.",
  "Benchmark is frictionless SPY buy-and-hold.",
  "Sharpe ratio assumes a 0% cash rate.",
  "Past results — real or simulated — do not determine future outcomes.",
];

const TRADING_DAYS_PER_YEAR = 252;

export function runBacktest(
  inputs: BacktestInputs,
  params: BacktestParams,
): BacktestResult {
  const days = inputs.tradingDays.filter(
    (d) => d.getTime() >= params.start.getTime() && d.getTime() <= params.end.getTime(),
  );
  if (days.length < 10) {
    throw new Error("Backtest window too short: fewer than 10 trading days.");
  }

  const rebalanceDays = pickRebalanceDays(days, params.rebalance);
  const costRate = params.txnCostBps / 10_000;

  // Holdings: ticker -> share count (portfolio starts with value 1.0 cash).
  let holdings = new Map<string, number>();
  let cash = 1;
  const points: BacktestResult["points"] = [];
  const rebalances: RebalanceEvent[] = [];

  const benchmarkStart = inputs.benchmark.get(isoDay(days[0]));
  if (!benchmarkStart) {
    throw new Error("Benchmark has no price at the start of the window.");
  }

  const priceOf = (ticker: string, day: string): number | null =>
    inputs.prices.get(ticker)?.get(day) ?? null;

  const portfolioValue = (day: string): number => {
    let value = cash;
    for (const [ticker, shares] of holdings) {
      const price = priceOf(ticker, day);
      if (price !== null) value += shares * price;
    }
    return value;
  };

  const rebalanceSet = new Set(rebalanceDays.map((d) => isoDay(d)));

  for (const day of days) {
    const iso = isoDay(day);

    if (rebalanceSet.has(iso)) {
      const value = portfolioValue(iso);
      const ranked = inputs
        .ranksAt(day)
        .filter((r) => priceOf(r.ticker, iso) !== null)
        .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
        .slice(0, params.topN);

      if (ranked.length > 0) {
        const targetPerName = value / ranked.length;
        const targets = new Map(ranked.map((r) => [r.ticker, targetPerName]));

        // One-way traded value: |target - current| per name.
        let traded = 0;
        const allTickers = new Set([...holdings.keys(), ...targets.keys()]);
        for (const ticker of allTickers) {
          const price = priceOf(ticker, iso);
          const currentValue =
            price !== null ? (holdings.get(ticker) ?? 0) * price : 0;
          traded += Math.abs((targets.get(ticker) ?? 0) - currentValue);
        }
        const cost = traded * costRate;

        // Execute: new equal-weight book, costs paid from portfolio value.
        const investable = value - cost;
        const newHoldings = new Map<string, number>();
        for (const r of ranked) {
          const price = priceOf(r.ticker, iso)!;
          newHoldings.set(r.ticker, investable / ranked.length / price);
        }
        holdings = newHoldings;
        cash = 0;
        rebalances.push({
          date: iso,
          tickers: ranked.map((r) => r.ticker),
          turnover: value > 0 ? traded / value : 0,
          costPaid: cost,
        });
      }
    }

    const benchmarkClose = inputs.benchmark.get(iso);
    points.push({
      date: iso,
      strategy: round6(portfolioValue(iso)),
      benchmark: benchmarkClose ? round6(benchmarkClose / benchmarkStart) : (points.at(-1)?.benchmark ?? 1),
    });
  }

  return {
    points,
    rebalances,
    stats: computeStats(points, rebalances),
    limitations: BACKTEST_LIMITATIONS,
  };
}

/** Last trading day of each month (or quarter) in the window, plus day one. */
export function pickRebalanceDays(
  days: Date[],
  cadence: "monthly" | "quarterly",
): Date[] {
  const out: Date[] = [days[0]];
  for (let i = 0; i < days.length - 1; i++) {
    const current = days[i];
    const next = days[i + 1];
    const monthChanges = current.getUTCMonth() !== next.getUTCMonth();
    if (!monthChanges) continue;
    if (
      cadence === "monthly" ||
      (current.getUTCMonth() + 1) % 3 === 0 // Mar/Jun/Sep/Dec ends
    ) {
      out.push(current);
    }
  }
  return out;
}

function computeStats(
  points: BacktestResult["points"],
  rebalances: RebalanceEvent[],
): BacktestResult["stats"] {
  const first = points[0];
  const last = points[points.length - 1];
  const n = points.length;

  const dailyReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    if (points[i - 1].strategy > 0) {
      dailyReturns.push(points[i].strategy / points[i - 1].strategy - 1);
    }
  }
  const mean = dailyReturns.length
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0;
  const variance = dailyReturns.length
    ? dailyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / dailyReturns.length
    : 0;
  const dailyVol = Math.sqrt(variance);
  const volatility = dailyReturns.length ? dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR) : null;

  const years = n / TRADING_DAYS_PER_YEAR;
  const totalReturn = last.strategy / first.strategy - 1;
  const cagr =
    years > 0.25 && first.strategy > 0
      ? Math.pow(last.strategy / first.strategy, 1 / years) - 1
      : null;

  const benchmarkTotalReturn = last.benchmark / first.benchmark - 1;
  const benchmarkCagr =
    years > 0.25 ? Math.pow(last.benchmark / first.benchmark, 1 / years) - 1 : null;

  const maxDrawdown = drawdown(points.map((p) => p.strategy));
  const benchmarkMaxDrawdown = drawdown(points.map((p) => p.benchmark));

  const avgTurnover =
    rebalances.length > 1
      ? rebalances.slice(1).reduce((a, r) => a + r.turnover, 0) / (rebalances.length - 1)
      : 0;
  const totalCostPaid = rebalances.reduce((a, r) => a + r.costPaid, 0);

  return {
    totalReturn: round4(totalReturn),
    cagr: cagr === null ? null : round4(cagr),
    volatility: volatility === null ? null : round4(volatility),
    maxDrawdown: round4(maxDrawdown),
    sharpe:
      cagr !== null && volatility !== null && volatility > 0
        ? round4(cagr / volatility)
        : null,
    benchmarkTotalReturn: round4(benchmarkTotalReturn),
    benchmarkCagr: benchmarkCagr === null ? null : round4(benchmarkCagr),
    benchmarkMaxDrawdown: round4(benchmarkMaxDrawdown),
    avgTurnover: round4(avgTurnover),
    totalCostPaid: round6(totalCostPaid),
    tradingDays: n,
  };
}

function drawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
