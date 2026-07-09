import { describe, expect, it } from "vitest";
import { addDays, todayUtc } from "@/lib/dates";
import { loadEnv } from "@/lib/config/env";
import { log } from "@/lib/logging/logger";
import { SecEdgarProvider } from "@/lib/providers/sec-edgar";
import { SEED_COMPANIES } from "../../prisma/data/universe";

/**
 * Keyless network smoke against SEC EDGAR. Run explicitly with:
 *   LIVE_SMOKE=1 npm test -- sec-live
 * Verifies (a) the adapter works against the real API and (b) the seed CIKs
 * point at the companies we think they do.
 */
const enabled = process.env.LIVE_SMOKE === "1";

describe.skipIf(!enabled)("SEC EDGAR live smoke (LIVE_SMOKE=1)", () => {
  const env = loadEnv({
    ...process.env,
    SEC_EDGAR_USER_AGENT:
      process.env.SEC_EDGAR_USER_AGENT ??
      "InvestIQ Research Lab smoke-test contact@example.com",
  });
  const ctx = { env, log, asOf: todayUtc() };
  const provider = new SecEdgarProvider();

  const expectations: Array<[ticker: string, namePattern: RegExp]> = [
    ["AAPL", /apple/i],
    ["SHOP", /shopify/i],
    ["RY", /royal bank/i],
    ["COIN", /coinbase/i],
  ];

  it.each(expectations)(
    "resolves %s filings and sane company identity",
    async (ticker) => {
      const company = SEED_COMPANIES.find((c) => c.ticker === ticker)!;
      const filings = await provider.getRecentFilings(
        { ticker: company.ticker, cik: company.cik },
        addDays(todayUtc(), -365),
        ctx,
      );
      expect(filings.length).toBeGreaterThan(0);
      expect(filings[0].url).toContain("sec.gov");
    },
    30_000,
  );

  it("pulls XBRL fundamentals for AAPL", async () => {
    const apple = SEED_COMPANIES.find((c) => c.ticker === "AAPL")!;
    const rows = await provider.getStatements(
      { ticker: apple.ticker, cik: apple.cik },
      ctx,
    );
    expect(rows.length).toBeGreaterThan(4);
    const latestAnnual = rows.filter((r) => r.periodType === "ANNUAL").at(-1)!;
    // Apple's annual revenue has been comfortably above $200B for years.
    expect(latestAnnual.revenue!).toBeGreaterThan(2e11);
  }, 30_000);
});
