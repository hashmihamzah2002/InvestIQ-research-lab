import { describe, expect, it, afterEach } from "vitest";
import { loadEnv, parseProviderChain } from "@/lib/config/env";
import { Logger, setLogSink, type LogEntry } from "@/lib/logging/logger";
import {
  parseJsonColumn,
  parseJsonColumnStrict,
  toJsonColumn,
  RatingSchema,
} from "@/lib/db/json";
import { z } from "zod";

describe("env config", () => {
  it("applies keyless defaults so the app runs with no configuration", () => {
    const env = loadEnv({});
    expect(env.DATABASE_URL).toBe("file:./dev.db");
    expect(env.MACRO_PROVIDERS).toContain("mock");
    expect(env.FILINGS_PROVIDERS.startsWith("sec-edgar")).toBe(true);
    expect(env.HTTP_TIMEOUT_MS).toBe(15000);
  });

  it("rejects invalid values with a readable error", () => {
    expect(() => loadEnv({ LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });

  it("parses provider chains tolerantly", () => {
    expect(parseProviderChain(" Finnhub, , csv ,MOCK ")).toEqual([
      "finnhub",
      "csv",
      "mock",
    ]);
  });
});

describe("logger", () => {
  afterEach(() => setLogSink(null));

  it("emits JSON lines with event and fields, respecting level threshold", () => {
    const entries: LogEntry[] = [];
    const lines: string[] = [];
    setLogSink((line, entry) => {
      lines.push(line);
      entries.push(entry);
    });

    const logger = new Logger({ step: "prices" }).child({ provider: "mock" });
    logger.debug("should.be.filtered"); // LOG_LEVEL=error in tests
    logger.error("refresh.step.failed", { ticker: "AAPL", err: new Error("boom") });

    expect(entries).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("refresh.step.failed");
    expect(parsed.step).toBe("prices");
    expect(parsed.provider).toBe("mock");
    expect(parsed.ticker).toBe("AAPL");
    expect(parsed.error).toBe("boom");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("json column helpers", () => {
  it("round-trips values through string columns", () => {
    const schema = z.array(z.string());
    const raw = toJsonColumn(["ITEM_4_02"]);
    expect(parseJsonColumn(schema, raw, [])).toEqual(["ITEM_4_02"]);
  });

  it("falls back on malformed payloads instead of crashing", () => {
    expect(parseJsonColumn(z.array(z.string()), "{not json", ["fallback"])).toEqual([
      "fallback",
    ]);
    expect(parseJsonColumn(z.array(z.string()), null, [])).toEqual([]);
  });

  it("strict variant throws with context", () => {
    expect(() =>
      parseJsonColumnStrict(z.object({ a: z.number() }), "[]", "breakdown"),
    ).toThrow(/breakdown/);
  });

  it("validates rating unions", () => {
    expect(RatingSchema.parse("WATCHLIST")).toBe("WATCHLIST");
    expect(() => RatingSchema.parse("BUY")).toThrow();
  });
});
