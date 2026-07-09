"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, RotateCcw } from "lucide-react";
import { RatingBadge } from "@/components/rating-badge";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtCurrency, fmtMult, fmtNum, fmtPct, fmtScore } from "@/lib/format";
import { RATING_LABELS } from "@/lib/scoring/constants";
import type { ScreenerResult, ScreenerRow } from "@/lib/queries/screener";

/**
 * Filter values are kept in HUMAN units (percent for margins/yields) and
 * converted to decimals when building the API query.
 */
interface Filters {
  sector: string;
  rating: string;
  marketCapMinB: string; // billions
  peMax: string;
  forwardPeMax: string;
  pegMax: string;
  revenueGrowthMinPct: string;
  grossMarginMinPct: string;
  operatingMarginMinPct: string;
  debtToEquityMax: string;
  fcfYieldMinPct: string;
  dividendYieldMinPct: string;
  sentimentMin: string;
  valuationMin: string;
  qualityMin: string;
  growthMin: string;
  momentumMin: string;
  riskMin: string;
}

const EMPTY_FILTERS: Filters = {
  sector: "all",
  rating: "all",
  marketCapMinB: "",
  peMax: "",
  forwardPeMax: "",
  pegMax: "",
  revenueGrowthMinPct: "",
  grossMarginMinPct: "",
  operatingMarginMinPct: "",
  debtToEquityMax: "",
  fcfYieldMinPct: "",
  dividendYieldMinPct: "",
  sentimentMin: "",
  valuationMin: "",
  qualityMin: "",
  growthMin: "",
  momentumMin: "",
  riskMin: "",
};

type SortKey =
  | "rank" | "overall" | "valuation" | "quality" | "growth" | "momentum"
  | "risk" | "marketCap" | "pe" | "forwardPe" | "peg" | "revenueGrowth"
  | "grossMargin" | "operatingMargin" | "debtToEquity" | "fcfYield"
  | "dividendYield" | "sentiment" | "ticker";

const COLUMNS: { key: SortKey; label: string; render: (r: ScreenerRow) => string }[] = [
  { key: "marketCap", label: "Mkt cap", render: (r) => fmtCurrency(r.marketCap) },
  { key: "pe", label: "P/E", render: (r) => fmtMult(r.pe) },
  { key: "forwardPe", label: "Fwd P/E", render: (r) => fmtMult(r.forwardPe) },
  { key: "peg", label: "PEG", render: (r) => fmtNum(r.peg, 2) },
  { key: "revenueGrowth", label: "Rev gr", render: (r) => fmtPct(r.revenueGrowthYoY) },
  { key: "grossMargin", label: "GM", render: (r) => fmtPct(r.grossMargin, 0) },
  { key: "operatingMargin", label: "OM", render: (r) => fmtPct(r.operatingMargin, 0) },
  { key: "debtToEquity", label: "D/E", render: (r) => fmtNum(r.debtToEquity, 2) },
  { key: "fcfYield", label: "FCF yld", render: (r) => fmtPct(r.fcfYield) },
  { key: "dividendYield", label: "Div yld", render: (r) => fmtPct(r.dividendYield) },
  { key: "sentiment", label: "Sent.", render: (r) => fmtNum(r.sentiment90d, 2) },
  { key: "valuation", label: "Val", render: (r) => fmtScore(r.valuationScore) },
  { key: "quality", label: "Qual", render: (r) => fmtScore(r.qualityScore) },
  { key: "growth", label: "Grow", render: (r) => fmtScore(r.growthScore) },
  { key: "momentum", label: "Mom", render: (r) => fmtScore(r.momentumScore) },
  { key: "risk", label: "Risk†", render: (r) => fmtScore(r.riskScore) },
  { key: "overall", label: "Overall", render: (r) => r.overallScore.toFixed(1) },
];

function buildQuery(filters: Filters, sort: SortKey, dir: "asc" | "desc"): string {
  const params = new URLSearchParams();
  const pct = (v: string) => (v === "" ? undefined : String(Number(v) / 100));
  const raw = (v: string) => (v === "" ? undefined : v);
  const entries: Record<string, string | undefined> = {
    sector: filters.sector === "all" ? undefined : filters.sector,
    rating: filters.rating === "all" ? undefined : filters.rating,
    marketCapMin:
      filters.marketCapMinB === ""
        ? undefined
        : String(Number(filters.marketCapMinB) * 1e9),
    peMax: raw(filters.peMax),
    forwardPeMax: raw(filters.forwardPeMax),
    pegMax: raw(filters.pegMax),
    revenueGrowthMin: pct(filters.revenueGrowthMinPct),
    grossMarginMin: pct(filters.grossMarginMinPct),
    operatingMarginMin: pct(filters.operatingMarginMinPct),
    debtToEquityMax: raw(filters.debtToEquityMax),
    fcfYieldMin: pct(filters.fcfYieldMinPct),
    dividendYieldMin: pct(filters.dividendYieldMinPct),
    sentimentMin: raw(filters.sentimentMin),
    valuationMin: raw(filters.valuationMin),
    qualityMin: raw(filters.qualityMin),
    growthMin: raw(filters.growthMin),
    momentumMin: raw(filters.momentumMin),
    riskMin: raw(filters.riskMin),
    sort,
    dir,
  };
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined) params.set(k, v);
  }
  return params.toString();
}

export function ScreenerClient({ initial }: { initial: ScreenerResult }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [result, setResult] = useState<ScreenerResult>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = useMemo(() => buildQuery(filters, sort, dir), [filters, sort, dir]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/stocks?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
        }
        setResult((await response.json()) as ScreenerResult);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setLoading(false);
      }
    }, 250); // debounce typing
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const setF = useCallback(
    (key: keyof Filters) => (value: string) =>
      setFilters((f) => ({ ...f, [key]: value })),
    [],
  );

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir(key === "rank" || key === "ticker" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    const header = [
      "rank", "ticker", "name", "sector", "marketCap", "pe", "forwardPe", "peg",
      "revenueGrowthYoY", "grossMargin", "operatingMargin", "debtToEquity",
      "fcfYield", "dividendYield", "sentiment90d", "valuationScore",
      "qualityScore", "growthScore", "momentumScore", "riskScore",
      "overallScore", "rating",
    ];
    const lines = [header.join(",")];
    for (const r of result.rows) {
      lines.push(
        [
          r.rank, r.ticker, JSON.stringify(r.name), JSON.stringify(r.sector),
          r.marketCap, r.pe, r.forwardPe, r.peg, r.revenueGrowthYoY,
          r.grossMargin, r.operatingMargin, r.debtToEquity, r.fcfYield,
          r.dividendYield, r.sentiment90d, r.valuationScore, r.qualityScore,
          r.growthScore, r.momentumScore, r.riskScore, r.overallScore, r.rating,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "investiq-screener.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const num = (key: keyof Filters, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        className="h-8"
        placeholder={placeholder}
        value={filters[key]}
        onChange={(e) => setF(key)(e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Sector</Label>
            <Select value={filters.sector} onValueChange={setF("sector")}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sectors</SelectItem>
                {result.sectors.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rating</Label>
            <Select value={filters.rating} onValueChange={setF("rating")}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ratings</SelectItem>
                {Object.entries(RATING_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {num("marketCapMinB", "Mkt cap min ($B)", "e.g. 50")}
          {num("peMax", "P/E max", "e.g. 30")}
          {num("forwardPeMax", "Fwd P/E max", "e.g. 25")}
          {num("pegMax", "PEG max", "e.g. 2")}
          {num("revenueGrowthMinPct", "Rev growth min %", "e.g. 10")}
          {num("grossMarginMinPct", "Gross margin min %", "e.g. 40")}
          {num("operatingMarginMinPct", "Op margin min %", "e.g. 15")}
          {num("debtToEquityMax", "D/E max", "e.g. 1.5")}
          {num("fcfYieldMinPct", "FCF yield min %", "e.g. 3")}
          {num("dividendYieldMinPct", "Div yield min %", "e.g. 1")}
          {num("sentimentMin", "Sentiment min (−1..1)", "e.g. 0")}
          {num("valuationMin", "Valuation ≥", "0-100")}
          {num("qualityMin", "Quality ≥", "0-100")}
          {num("growthMin", "Growth ≥", "0-100")}
          {num("momentumMin", "Momentum ≥", "0-100")}
          {num("riskMin", "Risk (safety) ≥", "0-100")}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5" /> Export CSV
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {loading
              ? "Filtering…"
              : `${result.rows.length} of ${result.totalUniverse} companies`}
          </span>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Screener error: {error}</p>
      ) : null}

      {/* Results */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="#" sortKey="rank" current={sort} dir={dir} onSort={toggleSort} />
              <SortableHead label="Ticker" sortKey="ticker" current={sort} dir={dir} onSort={toggleSort} />
              <TableHead>Sector</TableHead>
              {COLUMNS.map((c) => (
                <SortableHead
                  key={c.key}
                  label={c.label}
                  sortKey={c.key}
                  current={sort}
                  dir={dir}
                  onSort={toggleSort}
                  numeric
                />
              ))}
              <TableHead>Rating</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((r) => (
              <TableRow key={r.ticker}>
                <TableCell className="tabular-nums text-muted-foreground">
                  {r.rank ?? "—"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/stocks/${r.ticker}`}
                    className="font-mono font-semibold hover:underline"
                  >
                    {r.ticker}
                  </Link>
                </TableCell>
                <TableCell className="max-w-36 truncate text-xs text-muted-foreground">
                  {r.sector}
                </TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {c.render(r)}
                  </TableCell>
                ))}
                <TableCell>
                  <RatingBadge rating={r.rating} />
                </TableCell>
                <TableCell>
                  <SourceBadge source={r.priceSource} />
                </TableCell>
              </TableRow>
            ))}
            {result.rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 5} className="py-8 text-center text-sm text-muted-foreground">
                  No companies match the current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        † Risk is scored as safety: 100 = lower modeled risk. All values are
        model inputs/outputs with sources shown per row; see Methodology for
        formulas and Data Sources for provider caveats.
      </p>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = current === sortKey;
  return (
    <TableHead
      className={numeric ? "text-right" : undefined}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 hover:text-foreground ${active ? "font-semibold text-foreground" : ""}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}
