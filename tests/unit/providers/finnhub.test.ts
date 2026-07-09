import { describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { FinnhubProvider } from "@/lib/providers/finnhub";
import { ProviderError } from "@/lib/providers/types";
import { fakeFetch } from "../../helpers/fake-fetch";
import { makeCtx } from "../../helpers/provider-ctx";

const ENV = { FINNHUB_API_KEY: "test-key" };
const company = { ticker: "TESTCO" };

const day = (y: number, m: number, d: number): number =>
  Math.floor(Date.UTC(y, m - 1, d, 14, 30) / 1000); // intraday stamp

describe("FinnhubProvider", () => {
  it("maps candles to daily bars normalized to UTC midnight", async () => {
    const { fetchImpl } = fakeFetch([
      {
        match: "stock/candle",
        body: {
          s: "ok",
          t: [day(2026, 6, 9), day(2026, 6, 10)],
          o: [100, 101.8],
          h: [101.5, 103],
          l: [99, 100.5],
          c: [101, 102],
          v: [900000, 1200000],
        },
      },
    ]);
    const provider = new FinnhubProvider({ fetchImpl });
    const bars = await provider.getDailyPrices(
      company,
      { from: utcDate(2026, 6, 9), to: utcDate(2026, 6, 10) },
      makeCtx(ENV),
    );
    expect(bars).toHaveLength(2);
    expect(bars[0].date.toISOString()).toBe("2026-06-09T00:00:00.000Z");
    expect(bars[1].close).toBe(102);
  });

  it("returns empty on no_data and fails on error status", async () => {
    const noData = fakeFetch([{ match: "stock/candle", body: { s: "no_data" } }]);
    const provider = new FinnhubProvider({ fetchImpl: noData.fetchImpl });
    expect(
      await provider.getDailyPrices(company, { from: utcDate(2026, 6, 1), to: utcDate(2026, 6, 10) }, makeCtx(ENV)),
    ).toEqual([]);

    const errStatus = fakeFetch([{ match: "stock/candle", body: { s: "error" } }]);
    const provider2 = new FinnhubProvider({ fetchImpl: errStatus.fetchImpl });
    await expect(
      provider2.getDailyPrices(company, { from: utcDate(2026, 6, 1), to: utcDate(2026, 6, 10) }, makeCtx(ENV)),
    ).rejects.toThrow(ProviderError);
  });

  it("maps company news and applies lexicon sentiment", async () => {
    const { fetchImpl } = fakeFetch([
      {
        match: "company-news",
        body: [
          {
            datetime: day(2026, 6, 9),
            headline: "TESTCO beats expectations with record growth",
            url: "https://news.example.com/1",
            source: "Wire",
            summary: "Strong quarter with profit gains.",
          },
          {
            datetime: day(2026, 6, 10),
            headline: "TESTCO faces lawsuit and investigation",
            url: "https://news.example.com/2",
            source: "Wire",
            summary: "Regulatory probe announced.",
          },
        ],
      },
    ]);
    const provider = new FinnhubProvider({ fetchImpl });
    const items = await provider.getCompanyNews(company, utcDate(2026, 6, 1), makeCtx(ENV));
    expect(items).toHaveLength(2);
    expect(items[0].sentiment!).toBeGreaterThan(0);
    expect(items[1].sentiment!).toBeLessThan(0);
    expect(items.every((i) => i.sentiment! >= -1 && i.sentiment! <= 1)).toBe(true);
  });
});
