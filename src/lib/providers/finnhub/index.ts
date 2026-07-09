import { z } from "zod";
import type { Env } from "@/lib/config/env";
import { isoDay } from "@/lib/dates";
import {
  ProviderError,
  type CompanyRef,
  type DateRange,
  type MarketDataProvider,
  type NewsItemDTO,
  type NewsProvider,
  type PriceBarDTO,
  type ProviderContext,
} from "@/lib/providers/types";
import { CACHE_TTL_MS } from "../cache";
import { fetchJson, type HttpDeps } from "../http";
import { RateLimiter } from "../rate-limiter";
import { scoreSentiment } from "../sentiment";

/**
 * Finnhub — daily candles + company news. Free keys get news and quotes;
 * candle access varies by plan (a 403 simply falls through the chain).
 * News sentiment: Finnhub's free news feed has no sentiment field, so we
 * apply the transparent lexicon scorer (documented as naive).
 */
const CandleSchema = z.object({
  s: z.string(),
  t: z.array(z.number()).optional(),
  o: z.array(z.number()).optional(),
  h: z.array(z.number()).optional(),
  l: z.array(z.number()).optional(),
  c: z.array(z.number()).optional(),
  v: z.array(z.number()).optional(),
});

const NewsSchema = z.array(
  z.object({
    datetime: z.number(),
    headline: z.string(),
    url: z.string(),
    source: z.string().optional(),
    summary: z.string().optional(),
  }),
);

export class FinnhubProvider implements MarketDataProvider, NewsProvider {
  readonly name = "finnhub";
  readonly categories = ["market-data", "news"] as const;
  private readonly limiter = new RateLimiter(50, 60_000);

  constructor(private readonly deps: HttpDeps = {}) {}

  isConfigured(env: Env): boolean {
    return Boolean(env.FINNHUB_API_KEY);
  }

  private url(ctx: ProviderContext, path: string, params: string): string {
    return `https://finnhub.io/api/v1/${path}?${params}&token=${ctx.env.FINNHUB_API_KEY}`;
  }

  async getDailyPrices(
    company: CompanyRef,
    range: DateRange,
    ctx: ProviderContext,
  ): Promise<PriceBarDTO[]> {
    const from = Math.floor(range.from.getTime() / 1000);
    const to = Math.floor(range.to.getTime() / 1000) + 86_399;
    const payload = await fetchJson(
      {
        provider: this.name,
        category: "market-data",
        url: this.url(
          ctx,
          "stock/candle",
          `symbol=${encodeURIComponent(company.ticker)}&resolution=D&from=${from}&to=${to}`,
        ),
        timeoutMs: ctx.env.HTTP_TIMEOUT_MS,
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: CACHE_TTL_MS.prices,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );

    const parsed = CandleSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `candle payload failed validation: ${parsed.error.issues[0]?.message}`,
        this.name,
        "market-data",
      );
    }
    if (parsed.data.s === "no_data") return [];
    if (parsed.data.s !== "ok" || !parsed.data.t) {
      throw new ProviderError(
        `candle status ${parsed.data.s}`,
        this.name,
        "market-data",
      );
    }

    const { t, o, h, l, c, v } = parsed.data;
    const bars: PriceBarDTO[] = [];
    for (let i = 0; i < t.length; i++) {
      const date = new Date(t[i] * 1000);
      const day = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );
      bars.push({
        date: day,
        open: o?.[i] ?? c![i],
        high: h?.[i] ?? c![i],
        low: l?.[i] ?? c![i],
        close: c![i],
        adjClose: c![i],
        volume: v?.[i] ?? 0,
      });
    }
    return bars;
  }

  async getCompanyNews(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<NewsItemDTO[]> {
    const payload = await fetchJson(
      {
        provider: this.name,
        category: "news",
        url: this.url(
          ctx,
          "company-news",
          `symbol=${encodeURIComponent(company.ticker)}&from=${isoDay(since)}&to=${isoDay(ctx.asOf)}`,
        ),
        timeoutMs: ctx.env.HTTP_TIMEOUT_MS,
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: CACHE_TTL_MS.news,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );

    const parsed = NewsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `news payload failed validation: ${parsed.error.issues[0]?.message}`,
        this.name,
        "news",
      );
    }

    return parsed.data
      .filter((n) => n.url && n.headline)
      .map((n) => ({
        publishedAt: new Date(n.datetime * 1000),
        title: n.headline,
        url: n.url,
        source: n.source,
        summary: n.summary?.slice(0, 500),
        sentiment: scoreSentiment(`${n.headline} ${n.summary ?? ""}`),
      }));
  }
}

export const finnhubProvider = new FinnhubProvider();
