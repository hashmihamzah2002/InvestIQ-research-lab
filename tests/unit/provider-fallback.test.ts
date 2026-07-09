import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/config/env";
import { ensureAdaptersRegistered } from "@/lib/providers/register";
import {
  callWithFallback,
  listRegisteredAdapters,
  resolveChain,
  type FallbackAttempt,
} from "@/lib/providers/registry";
import { ProviderError, type ProviderBase } from "@/lib/providers/types";

ensureAdaptersRegistered();

function fakeProvider(
  name: string,
  behavior: "ok" | "fail",
): ProviderBase & { fetch: () => Promise<string> } {
  return {
    name,
    categories: ["market-data"],
    isConfigured: () => true,
    fetch: async () => {
      if (behavior === "fail") {
        throw new ProviderError(`${name} exploded`, name, "market-data");
      }
      return `${name}-data`;
    },
  };
}

describe("provider chain resolution", () => {
  it("registers all real adapters plus mock", () => {
    const names = listRegisteredAdapters();
    for (const expected of ["mock", "sec-edgar", "fred", "alpha-vantage", "finnhub", "fmp", "csv"]) {
      expect(names).toContain(expected);
    }
  });

  it("skips unconfigured adapters (no API key) and keeps order", () => {
    const noKeys = loadEnv({ MARKET_DATA_PROVIDERS: "finnhub,alpha-vantage,csv,mock" });
    expect(resolveChain("market-data", noKeys).map((p) => p.name)).toEqual([
      "csv",
      "mock",
    ]);

    const withKey = loadEnv({
      MARKET_DATA_PROVIDERS: "finnhub,alpha-vantage,csv,mock",
      FINNHUB_API_KEY: "k",
    });
    expect(resolveChain("market-data", withKey).map((p) => p.name)).toEqual([
      "finnhub",
      "csv",
      "mock",
    ]);
  });

  it("skips unknown names and adapters registered for other categories", () => {
    const env = loadEnv({ MARKET_DATA_PROVIDERS: "bogus,fred,mock" });
    // "fred" is macro-only, so it may not serve market-data.
    expect(resolveChain("market-data", env).map((p) => p.name)).toEqual(["mock"]);
  });

  it("falls back to mock when a chain resolves empty", () => {
    const env = loadEnv({ NEWS_PROVIDERS: "finnhub" }); // unconfigured
    expect(resolveChain("news", env).map((p) => p.name)).toEqual(["mock"]);
  });

  it("falls through failing providers and reports every attempt", async () => {
    const a = fakeProvider("a", "fail");
    const b = fakeProvider("b", "fail");
    const c = fakeProvider("c", "ok");
    const attempts: FallbackAttempt[] = [];

    const result = await callWithFallback(
      [a, b, c],
      "market-data",
      (p) => p.fetch(),
      (attempt) => {
        attempts.push(attempt);
      },
    );

    expect(result.provider).toBe("c");
    expect(result.value).toBe("c-data");
    expect(attempts).toEqual([
      { provider: "a", ok: false, error: "a exploded" },
      { provider: "b", ok: false, error: "b exploded" },
      { provider: "c", ok: true },
    ]);
  });

  it("throws the last error when every provider fails", async () => {
    const a = fakeProvider("a", "fail");
    const b = fakeProvider("b", "fail");
    await expect(
      callWithFallback([a, b], "market-data", (p) => p.fetch()),
    ).rejects.toThrow(/b exploded/);
  });
});
