import { z } from "zod";
import type { Env } from "@/lib/config/env";
import { addDays, isoDay } from "@/lib/dates";
import { MACRO_CATALOG } from "@/lib/macro/catalog";
import {
  ProviderError,
  type MacroObservationDTO,
  type MacroProvider,
  type ProviderContext,
} from "@/lib/providers/types";
import { CACHE_TTL_MS } from "../cache";
import { fetchJson, type HttpDeps } from "../http";
import { RateLimiter } from "../rate-limiter";

/**
 * FRED (Federal Reserve Economic Data) — macro series. Free API key.
 * Canonical seriesIds are mapped to FRED source series (+ optional YoY
 * transform) via MACRO_CATALOG.
 */
const ObservationsSchema = z.object({
  observations: z.array(
    z.object({
      date: z.string(),
      value: z.string(), // "." for missing
    }),
  ),
});

export class FredProvider implements MacroProvider {
  readonly name = "fred";
  readonly categories = ["macro"] as const;
  private readonly limiter = new RateLimiter(60, 60_000);

  constructor(private readonly deps: HttpDeps = {}) {}

  isConfigured(env: Env): boolean {
    return Boolean(env.FRED_API_KEY);
  }

  async getSeries(
    seriesId: string,
    since: Date,
    ctx: ProviderContext,
  ): Promise<MacroObservationDTO[]> {
    const def = MACRO_CATALOG.find((d) => d.seriesId === seriesId);
    if (!def) {
      throw new ProviderError(`unknown macro series ${seriesId}`, this.name, "macro");
    }

    // YoY transforms need ~13 months of extra source history.
    const fetchStart =
      def.fred.transform === "yoy" ? addDays(since, -400) : since;
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${encodeURIComponent(def.fred.sourceSeries)}` +
      `&api_key=${ctx.env.FRED_API_KEY}` +
      `&file_type=json&observation_start=${isoDay(fetchStart)}`;

    const payload = await fetchJson(
      {
        provider: this.name,
        category: "macro",
        url,
        timeoutMs: ctx.env.HTTP_TIMEOUT_MS,
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: CACHE_TTL_MS.macro,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );

    const parsed = ObservationsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `observations payload failed validation: ${parsed.error.issues[0]?.message}`,
        this.name,
        "macro",
      );
    }

    const values: { date: Date; value: number }[] = [];
    const byIso = new Map<string, number>();
    for (const obs of parsed.data.observations) {
      if (obs.value === ".") continue;
      const value = Number(obs.value);
      if (!Number.isFinite(value)) continue;
      values.push({ date: new Date(`${obs.date}T00:00:00.000Z`), value });
      byIso.set(obs.date, value);
    }

    let out: MacroObservationDTO[];
    if (def.fred.transform === "yoy") {
      out = values
        .map(({ date, value }) => {
          const prior = byIso.get(isoDayOneYearBefore(date));
          if (prior === undefined || prior === 0) return null;
          return {
            date,
            value: Math.round(((value / prior - 1) * 100) * 100) / 100,
          };
        })
        .filter((v): v is MacroObservationDTO => v !== null);
    } else {
      out = values;
    }

    return out.filter(
      (o) =>
        o.date.getTime() >= since.getTime() &&
        o.date.getTime() <= ctx.asOf.getTime(),
    );
  }
}

function isoDayOneYearBefore(date: Date): string {
  return `${date.getUTCFullYear() - 1}${date.toISOString().slice(4, 10)}`;
}

export const fredProvider = new FredProvider();
