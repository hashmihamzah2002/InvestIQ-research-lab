import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { CsvProvider } from "@/lib/providers/csv";
import { parseCsv, PriceRowSchema } from "@/lib/providers/csv/schemas";
import { ProviderError } from "@/lib/providers/types";
import { makeCtx } from "../../helpers/provider-ctx";

// The committed templates double as test data (fake ticker TESTCO).
const provider = new CsvProvider(join(process.cwd(), "data", "templates"));
const ctx = makeCtx();
const RANGE = { from: utcDate(2026, 6, 1), to: utcDate(2026, 6, 10) };

describe("CsvProvider", () => {
  it("serves price bars for tickers present in the file", async () => {
    const bars = await provider.getDailyPrices({ ticker: "TESTCO" }, RANGE, ctx);
    expect(bars).toHaveLength(3);
    expect(bars[0].date.toISOString().slice(0, 10)).toBe("2026-06-08");
    expect(bars[2].close).toBe(101.1);
  });

  it("fails (falls through) for unknown tickers, returns [] for empty windows", async () => {
    await expect(
      provider.getDailyPrices({ ticker: "NOPE" }, RANGE, ctx),
    ).rejects.toThrow(ProviderError);

    const empty = await provider.getDailyPrices(
      { ticker: "TESTCO" },
      { from: utcDate(2020, 1, 1), to: utcDate(2020, 1, 31) },
      ctx,
    );
    expect(empty).toEqual([]);
  });

  it("imports fundamentals, filings with flags, news, and macro series", async () => {
    const statements = await provider.getStatements({ ticker: "TESTCO" }, ctx);
    expect(statements).toHaveLength(2);
    expect(statements[0].periodType).toBe("ANNUAL");
    expect(statements[0].revenue).toBe(40e9);

    const filings = await provider.getRecentFilings(
      { ticker: "TESTCO" },
      utcDate(2026, 1, 1),
      ctx,
    );
    expect(filings).toHaveLength(3);
    const nt = filings.find((f) => f.form === "NT 10-Q")!;
    expect(nt.flags).toEqual(["LATE_FILING"]);

    const news = await provider.getCompanyNews(
      { ticker: "TESTCO" },
      utcDate(2026, 6, 1),
      ctx,
    );
    expect(news).toHaveLength(2);
    expect(news[0].sentiment).toBe(0.2);

    const fedfunds = await provider.getSeries("FEDFUNDS", utcDate(2026, 1, 1), ctx);
    expect(fedfunds).toHaveLength(2);
    const custom = await provider.getSeries("CUSTOM_SERIES", utcDate(2026, 1, 1), ctx);
    expect(custom).toHaveLength(1);
    expect(custom[0].value).toBe(42);
  });

  it("collects per-line errors without dropping valid rows", () => {
    const text = [
      "ticker,date,open,high,low,close,adjClose,volume",
      "GOOD,2026-06-10,10,11,9,10.5,10.5,1000",
      "BAD,not-a-date,10,11,9,10.5,10.5,1000",
      "ALSOGOOD,2026-06-09,20,21,19,20.5,,",
    ].join("\n");
    const { rows, errors } = parseCsv(text, PriceRowSchema);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(3);
    expect(errors[0].message).toContain("date");
    expect(rows[1].adjClose).toBeNull(); // empty -> null
  });
});
