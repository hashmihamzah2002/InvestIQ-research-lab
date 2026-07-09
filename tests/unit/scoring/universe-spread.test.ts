import { describe, expect, it } from "vitest";
import { scoreUniverseFromGenerators } from "../../helpers/universe-scoring";

/**
 * End-to-end pure test: mock generators -> metrics -> sector stats -> scores
 * for all 30 companies. Verifies the model discriminates (ratings spread
 * across bands) instead of bunching everything in the middle.
 */
describe("universe scoring spread (mock data)", () => {
  const scored = scoreUniverseFromGenerators();

  it("scores all 30 companies with high data coverage", () => {
    expect(scored).toHaveLength(30);
    for (const s of scored) {
      expect(s.breakdown.overall).toBeGreaterThanOrEqual(0);
      expect(s.breakdown.overall).toBeLessThanOrEqual(100);
      expect(s.breakdown.coverage).toBeGreaterThan(0.7);
      expect(s.breakdown.pillars).toHaveLength(5);
    }
  });

  it("spreads ratings across bands (model discriminates)", () => {
    const byRating = new Map<string, string[]>();
    for (const s of scored) {
      const list = byRating.get(s.breakdown.rating) ?? [];
      list.push(`${s.ticker}(${s.breakdown.overall.toFixed(0)})`);
      byRating.set(s.breakdown.rating, list);
    }
    // Tuning visibility: full distribution in test output.
    console.log("Rating distribution:");
    for (const [rating, tickers] of byRating) {
      console.log(`  ${rating}: ${tickers.join(", ")}`);
    }

    // Deterministic mock data at a fixed asOf: all four bands must appear
    // (verified distribution: 2 strong / 14 candidate / 13 watchlist / 1 avoid).
    const distinct = [...byRating.keys()];
    expect(distinct.length).toBe(4);
    const scores = scored.map((s) => s.breakdown.overall);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(25); // meaningful discrimination
  });

  it("produces sane pillar behavior for designed archetypes", () => {
    const intc = scored.find((s) => s.ticker === "INTC")!;
    const nvda = scored.find((s) => s.ticker === "NVDA")!;
    const ko = scored.find((s) => s.ticker === "KO")!;

    // Intel was seeded as the deteriorating archetype; NVIDIA as the growth
    // archetype — growth pillar must reflect that decisively.
    const growth = (s: typeof intc) =>
      s.breakdown.pillars.find((p) => p.key === "growth")!.score ?? 0;
    expect(growth(nvda)).toBeGreaterThan(growth(intc) + 15);

    // Coca-Cola (staples) must screen safer than Coinbase on cyclicality.
    const coin = scored.find((s) => s.ticker === "COIN")!;
    const cyc = (s: typeof ko) =>
      s.breakdown.pillars
        .find((p) => p.key === "risk")!
        .factors.find((f) => f.key === "sector_cyclicality")!.normalized!;
    expect(cyc(ko)).toBeGreaterThan(cyc(coin));

    // Banks: gross margin unavailable, quality still scored via reweighting.
    const jpm = scored.find((s) => s.ticker === "JPM")!;
    const gmFactor = jpm.breakdown.pillars
      .find((p) => p.key === "quality")!
      .factors.find((f) => f.key === "gross_margin")!;
    expect(gmFactor.available).toBe(false);
    expect(
      jpm.breakdown.pillars.find((p) => p.key === "quality")!.score,
    ).not.toBeNull();

    // McDonald's negative equity: ROE factor falls back with a note.
    const mcd = scored.find((s) => s.ticker === "MCD")!;
    const roeFactor = mcd.breakdown.pillars
      .find((p) => p.key === "quality")!
      .factors.find((f) => f.key === "roe")!;
    expect(roeFactor.note).toMatch(/ROA/i);
  });

  it("keeps every displayed factor explainable (raw -> normalized -> weight)", () => {
    for (const s of scored) {
      for (const pillar of s.breakdown.pillars) {
        for (const f of pillar.factors) {
          if (f.available) {
            expect(f.normalized).toBeGreaterThanOrEqual(0);
            expect(f.normalized).toBeLessThanOrEqual(100);
          } else {
            expect(f.note, `${s.ticker}/${f.key} needs an unavailability note`).toBeTruthy();
          }
        }
      }
    }
  });
});
