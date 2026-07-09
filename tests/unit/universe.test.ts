import { describe, expect, it } from "vitest";
import { MockProfileSchema } from "@/lib/providers/mock/profile";
import {
  INDEX_TICKER,
  SEED_COMPANIES,
  UNIVERSE_TICKERS,
} from "../../prisma/data/universe";

const REQUIRED_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "NKE", "COST",
  "WMT", "JPM", "V", "MA", "KO", "PEP", "MCD", "DIS", "NFLX", "AMD", "INTC",
  "CRM", "ADBE", "SHOP", "RY", "TD", "ENB", "BN", "CNI", "LULU", "COIN",
];

describe("seed universe", () => {
  it("contains exactly the 30 required companies plus the index proxy", () => {
    expect(UNIVERSE_TICKERS).toHaveLength(30);
    expect(new Set(UNIVERSE_TICKERS)).toEqual(new Set(REQUIRED_TICKERS));
    const index = SEED_COMPANIES.find((c) => c.ticker === INDEX_TICKER);
    expect(index?.isIndex).toBe(true);
  });

  it("has unique tickers and unique, well-formed CIKs", () => {
    const tickers = SEED_COMPANIES.map((c) => c.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);

    const ciks = SEED_COMPANIES.filter((c) => c.cik !== null).map((c) => c.cik!);
    expect(new Set(ciks).size).toBe(ciks.length);
    for (const cik of ciks) {
      expect(cik).toMatch(/^\d{10}$/);
    }
    // Every scored company files with the SEC (US filers + Canadian MJDS).
    for (const c of SEED_COMPANIES.filter((x) => !x.isIndex)) {
      expect(c.cik, `${c.ticker} should have a CIK`).not.toBeNull();
    }
  });

  it("has complete descriptive fields", () => {
    for (const c of SEED_COMPANIES) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.sector.length).toBeGreaterThan(2);
      expect(c.industry.length).toBeGreaterThan(2);
      expect(c.description.length).toBeGreaterThan(20);
      expect(c.website).toMatch(/^https:\/\//);
      expect(["US", "CA"]).toContain(c.country);
    }
  });

  it("has mock profiles that pass schema validation", () => {
    for (const c of SEED_COMPANIES) {
      const parsed = MockProfileSchema.safeParse(c.mockProfile);
      expect(parsed.success, `${c.ticker} profile invalid`).toBe(true);
    }
  });

  it("models banks without gross margin and MCD with negative equity", () => {
    for (const ticker of ["JPM", "RY", "TD", "BN"]) {
      const bank = SEED_COMPANIES.find((c) => c.ticker === ticker)!;
      expect(bank.mockProfile.grossMargin).toBeNull();
    }
    const mcd = SEED_COMPANIES.find((c) => c.ticker === "MCD")!;
    expect(mcd.mockProfile.equityPctRevenue).toBeLessThan(0);
    const coin = SEED_COMPANIES.find((c) => c.ticker === "COIN")!;
    expect(coin.mockProfile.ipoDate).toBe("2021-04-14");
  });

  it("keeps sector labels consistent for median grouping", () => {
    const sectors = new Map<string, number>();
    for (const c of SEED_COMPANIES.filter((x) => !x.isIndex)) {
      sectors.set(c.sector, (sectors.get(c.sector) ?? 0) + 1);
    }
    // 7 GICS-style sectors; at least three have >=3 members so sector-median
    // valuation comparisons are meaningful.
    expect(sectors.size).toBeGreaterThanOrEqual(5);
    const withQuorum = [...sectors.values()].filter((n) => n >= 3).length;
    expect(withQuorum).toBeGreaterThanOrEqual(3);
  });
});
