import { describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { FredProvider } from "@/lib/providers/fred";
import { ProviderError } from "@/lib/providers/types";
import { fakeFetch } from "../../helpers/fake-fetch";
import { makeCtx } from "../../helpers/provider-ctx";
import observationsFixture from "../../fixtures/fred-observations.json";

const ENV = { FRED_API_KEY: "test-key" };

describe("FredProvider", () => {
  it("is configured only with an API key", () => {
    const provider = new FredProvider();
    expect(provider.isConfigured(makeCtx().env)).toBe(false);
    expect(provider.isConfigured(makeCtx(ENV).env)).toBe(true);
  });

  it("passes level series through and skips missing values", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "series_id=FEDFUNDS", body: observationsFixture },
    ]);
    const provider = new FredProvider({ fetchImpl });
    const obs = await provider.getSeries("FEDFUNDS", utcDate(2026, 1, 1), makeCtx(ENV));

    expect(calls[0]).toContain("api.stlouisfed.org");
    // 2026-01..2026-06 minus the "." row = 5 observations.
    expect(obs).toHaveLength(5);
    expect(obs[0].value).toBe(310);
    expect(obs.every((o) => Number.isFinite(o.value))).toBe(true);
  });

  it("computes YoY transforms against the prior-year observation", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "series_id=CPIAUCSL", body: observationsFixture },
    ]);
    const provider = new FredProvider({ fetchImpl });
    const obs = await provider.getSeries("CPI_YOY", utcDate(2026, 1, 1), makeCtx(ENV));

    // Hand-computed: 310/300, 312/301, 309/302, (missing), 315/304, 316/305.
    expect(obs.map((o) => o.value)).toEqual([3.33, 3.65, 2.32, 3.62, 3.61]);
    expect(obs[0].date.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("rejects unknown canonical series ids", async () => {
    const provider = new FredProvider();
    await expect(
      provider.getSeries("NOT_A_SERIES", utcDate(2026, 1, 1), makeCtx(ENV)),
    ).rejects.toThrow(ProviderError);
  });
});
