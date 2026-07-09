import { z } from "zod";
import type { Env } from "@/lib/config/env";
import {
  FILING_FLAGS,
  ProviderError,
  type CompanyRef,
  type FilingDTO,
  type FilingsProvider,
  type FundamentalsProvider,
  type ProviderContext,
  type StatementPeriodDTO,
} from "@/lib/providers/types";
import { CACHE_TTL_MS } from "../cache";
import { fetchJson, type HttpDeps } from "../http";
import { RateLimiter } from "../rate-limiter";

/**
 * SEC EDGAR — filings (submissions API) and XBRL fundamentals (companyfacts).
 * No API key required; the SEC fair-access policy requires a descriptive
 * User-Agent with contact info (SEC_EDGAR_USER_AGENT) and <=10 req/s. We run
 * at 5 req/s.
 *
 * Known limitations (documented in docs/DATA_SOURCES.md):
 *  - companyfacts maps us-gaap concepts; Canadian MJDS filers report IFRS
 *    concepts, so their statements come back sparse/empty here and the chain
 *    falls through to the next provider.
 *  - totalDebt uses LongTermDebt only (short-term debt concepts vary too
 *    much across filers for a reliable generic mapping).
 */

const SubmissionsSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      form: z.array(z.string()),
      filingDate: z.array(z.string()),
      primaryDocument: z.array(z.string()),
      primaryDocDescription: z.array(z.string()).optional(),
      items: z.array(z.string()).optional(),
    }),
  }),
});

const FactEntrySchema = z.object({
  start: z.string().optional(),
  end: z.string(),
  val: z.number(),
  fy: z.number().nullish(),
  fp: z.string().nullish(),
  form: z.string().nullish(),
  filed: z.string().nullish(),
  frame: z.string().nullish(),
});
type FactEntry = z.infer<typeof FactEntrySchema>;

const CompanyFactsSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  entityName: z.string(),
  facts: z
    .object({
      "us-gaap": z.record(
        z.string(),
        z.object({
          units: z.record(z.string(), z.array(FactEntrySchema)),
        }),
      ).optional(),
    })
    .loose(),
});

/** Ordered concept candidates per statement field. */
const CONCEPTS: Record<string, { names: string[]; unit: string }> = {
  revenue: {
    names: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
    unit: "USD",
  },
  grossProfit: { names: ["GrossProfit"], unit: "USD" },
  operatingIncome: { names: ["OperatingIncomeLoss"], unit: "USD" },
  netIncome: { names: ["NetIncomeLoss"], unit: "USD" },
  eps: {
    names: ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
    unit: "USD/shares",
  },
  sharesOut: {
    names: [
      "WeightedAverageNumberOfDilutedSharesOutstanding",
      "WeightedAverageNumberOfSharesOutstandingBasic",
    ],
    unit: "shares",
  },
  totalAssets: { names: ["Assets"], unit: "USD" },
  totalLiabilities: { names: ["Liabilities"], unit: "USD" },
  totalEquity: {
    names: [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    unit: "USD",
  },
  cash: { names: ["CashAndCashEquivalentsAtCarryingValue"], unit: "USD" },
  totalDebt: { names: ["LongTermDebt", "LongTermDebtNoncurrent"], unit: "USD" },
  currentAssets: { names: ["AssetsCurrent"], unit: "USD" },
  currentLiabilities: { names: ["LiabilitiesCurrent"], unit: "USD" },
  operatingCashFlow: {
    names: ["NetCashProvidedByUsedInOperatingActivities"],
    unit: "USD",
  },
  capex: { names: ["PaymentsToAcquirePropertyPlantAndEquipment"], unit: "USD" },
  dividendsPaid: {
    names: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    unit: "USD",
  },
  interestExpense: { names: ["InterestExpense"], unit: "USD" },
};

function normalizeCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function durationDays(entry: FactEntry): number | null {
  if (!entry.start) return null;
  return Math.round(
    (isoToDate(entry.end).getTime() - isoToDate(entry.start).getTime()) / 86_400_000,
  );
}

export class SecEdgarProvider implements FilingsProvider, FundamentalsProvider {
  readonly name = "sec-edgar";
  readonly categories = ["filings", "fundamentals"] as const;
  private readonly limiter = new RateLimiter(5, 1000);

  constructor(private readonly deps: HttpDeps = {}) {}

  isConfigured(env: Env): boolean {
    return Boolean(env.SEC_EDGAR_USER_AGENT && env.SEC_EDGAR_USER_AGENT.length > 5);
  }

  private headers(ctx: ProviderContext): Record<string, string> {
    return {
      "User-Agent": ctx.env.SEC_EDGAR_USER_AGENT!,
      Accept: "application/json",
    };
  }

  private requireCik(company: CompanyRef, category: "filings" | "fundamentals"): string {
    if (!company.cik) {
      throw new ProviderError(
        `${company.ticker} has no CIK; SEC EDGAR cannot serve it`,
        this.name,
        category,
      );
    }
    return normalizeCik(company.cik);
  }

  async getRecentFilings(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<FilingDTO[]> {
    const cik = this.requireCik(company, "filings");
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const payload = await fetchJson(
      {
        provider: this.name,
        category: "filings",
        url,
        headers: this.headers(ctx),
        timeoutMs: ctx.env.HTTP_TIMEOUT_MS,
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: CACHE_TTL_MS.filings,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );

    const parsed = SubmissionsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `submissions payload failed validation: ${parsed.error.issues[0]?.message}`,
        this.name,
        "filings",
      );
    }

    const recent = parsed.data.filings.recent;
    const filings: FilingDTO[] = [];
    const cikNumeric = String(Number(cik));
    for (let i = 0; i < recent.accessionNumber.length; i++) {
      const filedAt = isoToDate(recent.filingDate[i]);
      if (filedAt.getTime() < since.getTime()) continue;
      if (filedAt.getTime() > ctx.asOf.getTime()) continue;

      const form = recent.form[i];
      const accession = recent.accessionNumber[i];
      const doc = recent.primaryDocument[i] || "";
      const itemsRaw = recent.items?.[i] ?? "";

      const flags: string[] = [];
      if (/^NT\s+10-[KQ]/i.test(form)) flags.push(FILING_FLAGS.LATE_FILING);
      if (form === "8-K") {
        if (itemsRaw.includes("4.02")) flags.push(FILING_FLAGS.NON_RELIANCE);
        if (itemsRaw.includes("4.01")) flags.push(FILING_FLAGS.AUDITOR_CHANGE);
      }

      const accessionPath = accession.replace(/-/g, "");
      filings.push({
        accessionNo: accession,
        form,
        filedAt,
        title:
          recent.primaryDocDescription?.[i] ||
          (itemsRaw ? `Items ${itemsRaw}` : form),
        url: doc
          ? `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionPath}/${doc}`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(form)}`,
        flags,
      });
    }
    return filings;
  }

  async getStatements(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<StatementPeriodDTO[]> {
    const cik = this.requireCik(company, "fundamentals");
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const payload = await fetchJson(
      {
        provider: this.name,
        category: "fundamentals",
        url,
        headers: this.headers(ctx),
        timeoutMs: Math.max(ctx.env.HTTP_TIMEOUT_MS, 30_000),
        rateLimiter: this.limiter,
        db: ctx.db,
        cacheTtlMs: CACHE_TTL_MS.fundamentals,
        cacheEnabled: ctx.env.API_CACHE_ENABLED !== 0,
      },
      this.deps,
    );

    const parsed = CompanyFactsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        `companyfacts payload failed validation: ${parsed.error.issues[0]?.message}`,
        this.name,
        "fundamentals",
      );
    }
    const gaap = parsed.data.facts["us-gaap"];
    if (!gaap) {
      throw new ProviderError(
        `no us-gaap facts for ${company.ticker} (IFRS filer?)`,
        this.name,
        "fundamentals",
      );
    }

    // Periods keyed by end date + type; fields filled from concept candidates.
    const periods = new Map<string, StatementPeriodDTO & { filedAt?: string }>();
    const ensurePeriod = (
      end: string,
      type: "ANNUAL" | "QUARTERLY",
    ): (StatementPeriodDTO & { filedAt?: string }) => {
      const key = `${end}:${type}`;
      let p = periods.get(key);
      if (!p) {
        p = { periodEnd: isoToDate(end), periodType: type };
        periods.set(key, p);
      }
      return p;
    };

    // Pass 1: duration facts define which periods exist.
    for (const [field, spec] of Object.entries(CONCEPTS)) {
      for (const conceptName of spec.names) {
        const concept = gaap[conceptName];
        const entries = concept?.units[spec.unit];
        if (!entries) continue;
        for (const entry of entries) {
          if (!entry.form || !/^(10-K|10-Q)/.test(entry.form)) continue;
          const days = durationDays(entry);
          if (days === null) continue; // instants handled in pass 2
          const type =
            days > 300 && days < 400
              ? "ANNUAL"
              : days > 75 && days < 105
                ? "QUARTERLY"
                : null;
          if (!type) continue;
          const period = ensurePeriod(entry.end, type);
          const current = period[field as keyof StatementPeriodDTO];
          if (current === undefined || current === null) {
            Object.assign(period, { [field]: entry.val });
            if (entry.filed && (!period.filedAt || entry.filed < period.filedAt)) {
              period.filedAt = entry.filed;
            }
          }
        }
        // First concept that produced anything wins for this field.
        if ([...periods.values()].some((p) => p[field as keyof StatementPeriodDTO] != null)) {
          break;
        }
      }
    }

    // Pass 2: instant facts (balance sheet) attach to matching period ends.
    const INSTANT_FIELDS = [
      "totalAssets",
      "totalLiabilities",
      "totalEquity",
      "cash",
      "totalDebt",
      "currentAssets",
      "currentLiabilities",
    ] as const;
    for (const field of INSTANT_FIELDS) {
      const spec = CONCEPTS[field];
      for (const conceptName of spec.names) {
        const entries = gaap[conceptName]?.units[spec.unit];
        if (!entries) continue;
        let attached = false;
        for (const entry of entries) {
          if (entry.start) continue; // instants only
          for (const type of ["ANNUAL", "QUARTERLY"] as const) {
            const period = periods.get(`${entry.end}:${type}`);
            if (period && period[field] == null) {
              Object.assign(period, { [field]: entry.val });
              attached = true;
            }
          }
        }
        if (attached) break;
      }
    }

    const rows = [...periods.values()]
      .map((p) => ({
        ...p,
        reportedAt: p.filedAt ? isoToDate(p.filedAt) : null,
      }))
      .filter((p) => p.revenue != null || p.netIncome != null || p.totalAssets != null)
      .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());

    if (rows.length === 0) {
      throw new ProviderError(
        `companyfacts produced no usable periods for ${company.ticker}`,
        this.name,
        "fundamentals",
      );
    }
    // Strip the internal filedAt helper field.
    return rows.map((row) => {
      const copy = { ...row };
      delete copy.filedAt;
      return copy;
    });
  }
}

export const secEdgarProvider = new SecEdgarProvider();
