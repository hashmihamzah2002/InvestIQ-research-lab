import type { Metadata } from "next";
import { ComplianceNotice } from "@/components/compliance-notice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MACRO_CATALOG } from "@/lib/macro/catalog";

export const metadata: Metadata = { title: "Data Sources & Limitations" };

const PROVIDERS: {
  name: string;
  categories: string;
  key: string;
  limits: string;
  caveats: string;
}[] = [
  {
    name: "SEC EDGAR",
    categories: "Filings, XBRL fundamentals",
    key: "None — requires only a User-Agent with contact info (SEC fair-access policy)",
    limits: "10 req/s allowed; app runs at 5 req/s",
    caveats:
      "XBRL mapping covers common us-gaap concepts; Canadian MJDS filers report IFRS and fall through to the next provider. Total debt uses LongTermDebt only. Filing red flags parsed: NT forms, 8-K items 4.01/4.02.",
  },
  {
    name: "FRED",
    categories: "Macro indicators",
    key: "Free API key",
    limits: "~120 req/min; app runs at 60/min",
    caveats: "CPI and GDP are transformed to YoY in the adapter; revisions overwrite history.",
  },
  {
    name: "Alpha Vantage",
    categories: "Prices, statements, overview",
    key: "Free key",
    limits: "25 requests/DAY on the free tier — far below a full refresh",
    caveats:
      "Expect throttle notices (HTTP 200 with a 'Note' body — treated as provider failure, chain falls through). Statement field coverage varies by company.",
  },
  {
    name: "Finnhub",
    categories: "Prices (candles), company news",
    key: "Free key",
    limits: "60 req/min; app runs at 50/min",
    caveats:
      "Candle access depends on plan (403 falls through). Free news has no sentiment — a transparent lexicon scorer fills in (naive; see below).",
  },
  {
    name: "Financial Modeling Prep",
    categories: "Statements, TTM ratios",
    key: "Free tier",
    limits: "~250 req/day free",
    caveats: "Negative cash-flow conventions normalized (capex, dividends stored positive).",
  },
  {
    name: "CSV import",
    categories: "All five categories",
    key: "None",
    limits: "Local files / admin upload",
    caveats:
      "Rows are validated individually; invalid lines are reported with line numbers and skipped. Templates in data/templates/.",
  },
  {
    name: "Mock (deterministic)",
    categories: "All five categories — terminal fallback",
    key: "None",
    limits: "None",
    caveats:
      "Seeded-PRNG synthetic data shaped by curated per-company profiles. Clearly badged 'mock — illustrative' everywhere. Filings are neutral only — the mock never fabricates negative events for real companies.",
  },
];

export default function DataSourcesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Data sources &amp; limitations
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every data category flows through an ordered provider chain
          (configure in .env). A provider failing — network error, quota,
          invalid payload — falls through to the next; the chain ends at the
          deterministic mock so a refresh always completes. Every stored row
          keeps its source, and the UI shows it next to the data.
        </p>
      </div>

      <ComplianceNotice kind="data" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Providers</CardTitle>
          <CardDescription>
            Chains per category are set via MARKET_DATA_PROVIDERS,
            FUNDAMENTALS_PROVIDERS, FILINGS_PROVIDERS, NEWS_PROVIDERS,
            MACRO_PROVIDERS (see .env.example).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Credentials</TableHead>
                <TableHead>Rate limits</TableHead>
                <TableHead>Known caveats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PROVIDERS.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-sm">{p.categories}</TableCell>
                  <TableCell className="text-sm">{p.key}</TableCell>
                  <TableCell className="text-sm">{p.limits}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {p.caveats}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Macro series tracked</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Series</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>FRED source</TableHead>
                <TableHead>Transform</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MACRO_CATALOG.map((s) => (
                <TableRow key={s.seriesId}>
                  <TableCell className="font-mono text-sm">{s.seriesId}</TableCell>
                  <TableCell className="text-sm">{s.name}</TableCell>
                  <TableCell className="font-mono text-sm">{s.fred.sourceSeries}</TableCell>
                  <TableCell className="text-sm">{s.fred.transform}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Honest limitations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong>Free-tier budgets are tiny.</strong> A full 30-company
              refresh needs ~100+ requests per fundamentals provider; Alpha
              Vantage&apos;s 25/day cannot cover it. The response cache (12-24h
              TTLs) and chain fallback keep refreshes completing, but expect
              mixed sources.
            </li>
            <li>
              <strong>Delays.</strong> Free price data is typically end-of-day
              or delayed; nothing here is real-time.
            </li>
            <li>
              <strong>Mock data is synthetic.</strong> It exists so the app
              works with zero keys and for demos/tests. It approximates each
              company&apos;s character but is NOT market data — always badged.
            </li>
            <li>
              <strong>Lexicon sentiment is naive.</strong> Word-counting over
              headlines; sarcasm, negation, and context defeat it. Treat as a
              weak signal.
            </li>
            <li>
              <strong>XBRL is messy.</strong> Companies tag concepts
              differently; the EDGAR mapping is a pragmatic subset and can
              miss or misclassify fields for unusual filers.
            </li>
            <li>
              <strong>Licensing.</strong> Free API tiers are for personal,
              non-commercial use — check each provider&apos;s terms before
              deploying beyond local research.
            </li>
            <li>
              <strong>CSV formats.</strong> Import templates (with required
              headers) live in <code className="font-mono">data/templates/</code>;
              drop completed files into{" "}
              <code className="font-mono">data/imports/</code> or upload via the
              Admin page.
            </li>
          </ul>
        </CardContent>
      </Card>

      <ComplianceNotice kind="educational" />
    </div>
  );
}
