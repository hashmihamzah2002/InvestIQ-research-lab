import { describe, expect, it } from "vitest";
import { utcDate } from "@/lib/dates";
import { SecEdgarProvider } from "@/lib/providers/sec-edgar";
import { FILING_FLAGS, ProviderError } from "@/lib/providers/types";
import { fakeFetch } from "../../helpers/fake-fetch";
import { makeCtx } from "../../helpers/provider-ctx";
import submissionsFixture from "../../fixtures/sec-submissions.json";
import companyFactsFixture from "../../fixtures/sec-companyfacts.json";

const ENV = { SEC_EDGAR_USER_AGENT: "InvestIQ test test@example.com" };
const company = { ticker: "TEST", cik: "0000320193" };

describe("SecEdgarProvider", () => {
  it("is configured only when a user agent is set", () => {
    const provider = new SecEdgarProvider();
    expect(provider.isConfigured(makeCtx().env)).toBe(false);
    expect(provider.isConfigured(makeCtx(ENV).env)).toBe(true);
  });

  it("maps submissions to filings with red flags and archive URLs", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "data.sec.gov/submissions/CIK0000320193.json", body: submissionsFixture },
    ]);
    const provider = new SecEdgarProvider({ fetchImpl });
    const filings = await provider.getRecentFilings(
      company,
      utcDate(2026, 1, 1),
      makeCtx(ENV),
    );

    expect(filings).toHaveLength(3); // 2025-11-01 10-K excluded by since
    const eightK = filings.find((f) => f.form === "8-K")!;
    expect(eightK.flags).toContain(FILING_FLAGS.NON_RELIANCE);
    expect(eightK.url).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000055/form8k.htm",
    );
    const nt = filings.find((f) => f.form === "NT 10-Q")!;
    expect(nt.flags).toContain(FILING_FLAGS.LATE_FILING);
    const tenQ = filings.find((f) => f.form === "10-Q")!;
    expect(tenQ.flags).toHaveLength(0);
  });

  it("maps companyfacts XBRL into statement periods", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "api/xbrl/companyfacts", body: companyFactsFixture },
    ]);
    const provider = new SecEdgarProvider({ fetchImpl });
    const rows = await provider.getStatements(company, makeCtx(ENV));

    const annual = rows.find((r) => r.periodType === "ANNUAL")!;
    expect(annual.periodEnd.toISOString().slice(0, 10)).toBe("2024-12-31");
    expect(annual.revenue).toBe(40_000_000_000);
    expect(annual.netIncome).toBe(6_000_000_000);
    expect(annual.eps).toBe(6);
    expect(annual.totalAssets).toBe(60_000_000_000);
    expect(annual.totalEquity).toBe(25_000_000_000);
    expect(annual.operatingCashFlow).toBe(9_000_000_000);
    expect(annual.reportedAt?.toISOString().slice(0, 10)).toBe("2025-02-20");

    const q1 = rows.find(
      (r) =>
        r.periodType === "QUARTERLY" &&
        r.periodEnd.toISOString().startsWith("2025-03-31"),
    )!;
    expect(q1.revenue).toBe(10_500_000_000);
    expect(q1.totalAssets).toBe(61_000_000_000);

    // The 6-month duration entry (H1 2024) must not appear as a quarter.
    const h1 = rows.find((r) =>
      r.periodEnd.toISOString().startsWith("2024-06-30"),
    );
    expect(h1).toBeUndefined();
  });

  it("fails cleanly without a CIK so the chain can fall through", async () => {
    const provider = new SecEdgarProvider();
    await expect(
      provider.getRecentFilings({ ticker: "X", cik: null }, utcDate(2026, 1, 1), makeCtx(ENV)),
    ).rejects.toThrow(ProviderError);
  });

  it("treats invalid payloads as provider failures", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "data.sec.gov", body: { unexpected: "shape" } },
    ]);
    const provider = new SecEdgarProvider({ fetchImpl });
    await expect(
      provider.getRecentFilings(company, utcDate(2026, 1, 1), makeCtx(ENV)),
    ).rejects.toThrow(/validation/);
  });
});
