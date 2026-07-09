import { describe, expect, it } from "vitest";
import { isWeekend, isoDay, utcDate } from "@/lib/dates";
import {
  generateDailyPrices,
  generateFilings,
  generateFundamentals,
  generateKeyMetrics,
  generateMacroSeries,
  generateNews,
} from "@/lib/providers/mock/generators";
import { defaultProfileFor, type MockProfile } from "@/lib/providers/mock/profile";

const ASOF = utcDate(2026, 6, 10);
const RANGE = { from: utcDate(2020, 1, 1), to: ASOF };

const calmProfile: MockProfile = {
  ...defaultProfileFor("TESTCO"),
  startPrice: 100,
  drift: 0.1,
  vol: 0.2,
  baseRevenue: 40e9,
  revenueGrowth: 0.08,
  grossMargin: 0.5,
  operatingMargin: 0.2,
  marginTrend: 0.002,
  taxRate: 0.2,
  sharesOut: 1e9,
  equityPctRevenue: 0.5,
  debtToEquity: 0.6,
  cashPctRevenue: 0.2,
  dividendPayout: 0.3,
  capexPctRevenue: 0.05,
  fundamentalsNoise: 0.05,
  ipoDate: undefined,
};

describe("mock price generator", () => {
  it("is deterministic across calls", () => {
    const a = generateDailyPrices("TESTCO", calmProfile, RANGE);
    const b = generateDailyPrices("TESTCO", calmProfile, RANGE);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1500);
  });

  it("differs across tickers", () => {
    const a = generateDailyPrices("AAA", calmProfile, RANGE);
    const b = generateDailyPrices("BBB", calmProfile, RANGE);
    expect(a[100].close).not.toBe(b[100].close);
  });

  it("emits weekday-only bars with coherent OHLC", () => {
    const bars = generateDailyPrices("TESTCO", calmProfile, RANGE);
    for (const bar of bars.slice(0, 500)) {
      expect(isWeekend(bar.date)).toBe(false);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close) + 1e-9);
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close) - 1e-9);
      expect(bar.low).toBeGreaterThan(0);
      expect(bar.volume).toBeGreaterThan(0);
    }
  });

  it("keeps history stable when the window extends (fixed epoch anchor)", () => {
    const early = generateDailyPrices("TESTCO", calmProfile, {
      from: utcDate(2023, 1, 1),
      to: utcDate(2024, 1, 1),
    });
    const late = generateDailyPrices("TESTCO", calmProfile, {
      from: utcDate(2023, 1, 1),
      to: utcDate(2026, 1, 1),
    });
    expect(late.slice(0, early.length)).toEqual(early);
  });

  it("respects ipoDate — no bars before listing", () => {
    const ipoProfile = { ...calmProfile, ipoDate: "2021-04-14" };
    const bars = generateDailyPrices("NEWCO", ipoProfile, RANGE);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0].date.getTime()).toBeGreaterThanOrEqual(
      utcDate(2021, 4, 14).getTime(),
    );
  });
});

describe("mock fundamentals generator", () => {
  it("is deterministic and only returns reported periods", () => {
    const a = generateFundamentals("TESTCO", calmProfile, ASOF);
    const b = generateFundamentals("TESTCO", calmProfile, ASOF);
    expect(a).toEqual(b);
    for (const period of a) {
      expect(period.reportedAt).toBeTruthy();
      expect(period.reportedAt!.getTime()).toBeLessThanOrEqual(ASOF.getTime());
    }
    const quarters = a.filter((p) => p.periodType === "QUARTERLY");
    // 2020Q1..2026Q1 = 25 quarters reported by 2026-06-10.
    expect(quarters.length).toBe(25);
  });

  it("annual rows equal the sum of their four quarters", () => {
    const rows = generateFundamentals("TESTCO", calmProfile, ASOF);
    const q2023 = rows.filter(
      (p) =>
        p.periodType === "QUARTERLY" && p.periodEnd.getUTCFullYear() === 2023,
    );
    const a2023 = rows.find(
      (p) => p.periodType === "ANNUAL" && p.periodEnd.getUTCFullYear() === 2023,
    );
    expect(q2023).toHaveLength(4);
    expect(a2023).toBeTruthy();
    const revSum = q2023.reduce((acc, r) => acc + (r.revenue ?? 0), 0);
    expect(Math.abs(a2023!.revenue! - revSum)).toBeLessThanOrEqual(2);
    // Balance sheet = Q4 snapshot, not a sum.
    expect(a2023!.totalEquity).toBe(q2023[3].totalEquity);
  });

  it("supports bank-style profiles (no gross margin)", () => {
    const bank = { ...calmProfile, grossMargin: null };
    const rows = generateFundamentals("BANKCO", bank, ASOF);
    expect(rows.every((r) => r.grossProfit === null)).toBe(true);
    expect(rows.every((r) => (r.revenue ?? 0) > 0)).toBe(true);
  });

  it("supports negative-equity profiles (buyback balance sheets)", () => {
    const negEq = { ...calmProfile, equityPctRevenue: -0.2, debtToEquity: 9 };
    const rows = generateFundamentals("NEGCO", negEq, ASOF);
    const latest = rows.at(-1)!;
    expect(latest.totalEquity!).toBeLessThan(0);
    expect(latest.totalAssets!).toBeGreaterThan(0);
    expect(latest.totalDebt!).toBeGreaterThan(0);
  });
});

describe("mock key metrics generator", () => {
  it("produces stable estimates within a quarter", () => {
    const a = generateKeyMetrics("TESTCO", calmProfile, utcDate(2026, 5, 1));
    const b = generateKeyMetrics("TESTCO", calmProfile, utcDate(2026, 6, 10));
    expect(a.forwardGrowth).toBe(b.forwardGrowth); // same Q2 seed
    expect(a.forwardPe).toBeGreaterThan(0);
    expect(a.dividendYield).toBeGreaterThan(0); // payout 0.3
    expect(Math.abs(a.epsRevisionTrend!)).toBeLessThanOrEqual(1);
  });

  it("omits dividend yield for non-payers", () => {
    const noDiv = { ...calmProfile, dividendPayout: 0 };
    const km = generateKeyMetrics("NODIV", noDiv, ASOF);
    expect(km.dividendYield).toBeNull();
  });
});

describe("mock filings generator", () => {
  it("emits US forms with unique accession numbers and no fabricated flags", () => {
    const filings = generateFilings("TESTCO", calmProfile, "US", RANGE.from, ASOF);
    expect(filings.length).toBeGreaterThan(20);
    const accessions = new Set(filings.map((f) => f.accessionNo));
    expect(accessions.size).toBe(filings.length);
    const forms = new Set(filings.map((f) => f.form));
    expect(forms.has("10-K")).toBe(true);
    expect(forms.has("10-Q")).toBe(true);
    expect(filings.every((f) => f.flags.length === 0)).toBe(true);
    for (const f of filings) {
      expect(f.filedAt.getTime()).toBeGreaterThanOrEqual(RANGE.from.getTime());
      expect(f.filedAt.getTime()).toBeLessThanOrEqual(ASOF.getTime());
    }
  });

  it("emits Canadian MJDS forms for CA issuers", () => {
    const filings = generateFilings("CANCO", calmProfile, "CA", RANGE.from, ASOF);
    const forms = new Set(filings.map((f) => f.form));
    expect(forms.has("40-F")).toBe(true);
    expect(forms.has("6-K")).toBe(true);
    expect(forms.has("10-K")).toBe(false);
  });

  it("respects the since cutoff", () => {
    const since = utcDate(2025, 1, 1);
    const filings = generateFilings("TESTCO", calmProfile, "US", since, ASOF);
    expect(filings.every((f) => f.filedAt.getTime() >= since.getTime())).toBe(true);
  });
});

describe("mock news generator", () => {
  it("is deterministic with bounded sentiment and window", () => {
    const since = utcDate(2025, 12, 12);
    const a = generateNews("TESTCO", calmProfile, "Tech", since, ASOF);
    const b = generateNews("TESTCO", calmProfile, "Tech", since, ASOF);
    expect(a).toEqual(b);
    // ~0.18/day over 180 days => ~32 expected; keep loose bounds.
    expect(a.length).toBeGreaterThan(10);
    expect(a.length).toBeLessThan(80);
    for (const item of a) {
      expect(item.sentiment!).toBeGreaterThanOrEqual(-0.9);
      expect(item.sentiment!).toBeLessThanOrEqual(0.9);
      expect(item.publishedAt.getTime()).toBeGreaterThanOrEqual(since.getTime());
      expect(item.publishedAt.getTime()).toBeLessThanOrEqual(ASOF.getTime());
      // Headlines mention the ticker or its sector (sector-outlook template).
      expect(item.title.includes("TESTCO") || item.title.includes("Tech")).toBe(true);
    }
  });
});

describe("mock macro generator", () => {
  it("produces monthly first-of-month observations in plausible ranges", () => {
    const obs = generateMacroSeries("FEDFUNDS", utcDate(2020, 1, 1), ASOF);
    expect(obs.length).toBeGreaterThan(70);
    for (const o of obs) {
      expect(o.date.getUTCDate()).toBe(1);
      expect(o.value).toBeGreaterThan(-0.5);
      expect(o.value).toBeLessThan(6.5);
    }
    expect(isoDay(obs[0].date)).toBe("2020-01-01");
  });

  it("produces quarterly GDP growth", () => {
    const obs = generateMacroSeries("GDP_GROWTH", utcDate(2020, 1, 1), ASOF);
    expect(obs.length).toBeGreaterThan(20);
    for (const o of obs) {
      expect([1, 4, 7, 10]).toContain(o.date.getUTCMonth() + 1);
    }
  });

  it("keeps the 10y-2y spread consistent with its legs", () => {
    const d10 = generateMacroSeries("DGS10", utcDate(2024, 1, 1), ASOF);
    const d2 = generateMacroSeries("DGS2", utcDate(2024, 1, 1), ASOF);
    const spread = generateMacroSeries("T10Y2Y", utcDate(2024, 1, 1), ASOF);
    for (let i = 0; i < spread.length; i++) {
      const implied = d10[i].value - d2[i].value;
      expect(Math.abs(spread[i].value - implied)).toBeLessThan(0.5);
    }
  });

  it("returns empty for unknown series", () => {
    expect(generateMacroSeries("NOPE", utcDate(2024, 1, 1), ASOF)).toEqual([]);
  });
});
