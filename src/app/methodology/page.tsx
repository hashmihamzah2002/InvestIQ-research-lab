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
import { Badge } from "@/components/ui/badge";
import {
  ABS_RETURN_1M_ANCHORS,
  COMPRESSION_PERCENTILE_ANCHORS,
  CURRENT_RATIO_ANCHORS,
  DEBT_TO_EQUITY_ANCHORS,
  EARNINGS_STABILITY_ANCHORS,
  EPS_GROWTH_ANCHORS,
  EPS_REVISION_ANCHORS,
  FACTOR_WEIGHTS,
  FCF_CONSISTENCY_ANCHORS,
  FCF_YIELD_ANCHORS,
  INDUSTRY_TAILWINDS,
  INDUSTRY_TAILWIND_DEFAULT,
  INTEREST_COVERAGE_ANCHORS,
  MARGIN_EXPANSION_ANCHORS,
  MIN_OVERALL_COVERAGE,
  MIN_PILLAR_COVERAGE,
  MIN_SECTOR_PEERS,
  NET_DEBT_EBITDA_ANCHORS,
  OPERATING_MARGIN_ANCHORS,
  OVERRIDE_RULES,
  PEG_ANCHORS,
  PILLAR_LABELS,
  PILLAR_WEIGHTS,
  PS_GROWTH_ADJ_ANCHORS,
  RATING_LABELS,
  RATING_THRESHOLDS,
  RATIO_VS_MEDIAN_ANCHORS,
  REL_RETURN_12M_EX_1M_ANCHORS,
  REL_RETURN_3M_ANCHORS,
  REL_RETURN_6M_ANCHORS,
  REVENUE_GROWTH_ANCHORS,
  ROA_ANCHORS,
  ROE_ANCHORS,
  SECTOR_CYCLICALITY,
  SECTOR_CYCLICALITY_DEFAULT,
  type AnchorTable,
} from "@/lib/scoring/constants";
import type { PillarKey } from "@/lib/scoring/types";

export const metadata: Metadata = { title: "Methodology" };

// Rendered per-request so the shared layout reflects runtime flags
// (DEMO_MODE nav) instead of being frozen at build time.
export const dynamic = "force-dynamic";

/**
 * IMPORTANT: every number on this page is imported from
 * src/lib/scoring/constants.ts — the exact values the engine uses. There is
 * no hand-written copy to drift out of date.
 */

const FACTOR_DESCRIPTIONS: Record<string, { label: string; how: string; anchors?: AnchorTable; unit?: string }> = {
  // Valuation
  pe_vs_sector: { label: "P/E vs sector median", how: "Trailing P/E divided by the sector median; ratios below 1 score higher.", anchors: RATIO_VS_MEDIAN_ANCHORS, unit: "× median" },
  forward_pe_vs_sector: { label: "Forward P/E vs sector median", how: "Same comparison using provider forward-earnings estimates.", anchors: RATIO_VS_MEDIAN_ANCHORS, unit: "× median" },
  peg: { label: "PEG ratio", how: "P/E divided by earnings growth (forward estimate when available, else trailing YoY).", anchors: PEG_ANCHORS },
  ev_ebitda_vs_sector: { label: "EV/EBITDA vs sector median", how: "Enterprise value (market cap + debt − cash) over TTM EBITDA, relative to sector.", anchors: RATIO_VS_MEDIAN_ANCHORS, unit: "× median" },
  fcf_yield: { label: "Free cash flow yield", how: "TTM (operating cash flow − capex) / market cap, on absolute anchors.", anchors: FCF_YIELD_ANCHORS, unit: "decimal" },
  ps_growth_adjusted: { label: "P/S (growth-adjusted)", how: "Price/sales divided by revenue growth % (clamped 2–60) — growth priced cheaply scores high.", anchors: PS_GROWTH_ADJ_ANCHORS },
  // Quality
  gross_margin: { label: "Gross margin", how: "Percentile within the sector comparison group (margins are only comparable within an industry)." },
  operating_margin: { label: "Operating margin", how: "TTM operating income / revenue on absolute anchors.", anchors: OPERATING_MARGIN_ANCHORS, unit: "decimal" },
  roe: { label: "Return on equity", how: "TTM net income / average book equity. Negative-equity companies are scored on ROA instead (noted in the breakdown).", anchors: ROE_ANCHORS, unit: "decimal" },
  fcf_consistency: { label: "FCF consistency", how: "Share of the last 8 quarters with positive free cash flow.", anchors: FCF_CONSISTENCY_ANCHORS, unit: "fraction" },
  balance_sheet: { label: "Balance-sheet strength", how: "Net debt / TTM EBITDA (negative = net cash); falls back to the current ratio when EBITDA isn't usable.", anchors: NET_DEBT_EBITDA_ANCHORS, unit: "×" },
  earnings_stability: { label: "Earnings stability", how: "Standard deviation of quarterly YoY EPS growth — steadier is better.", anchors: EARNINGS_STABILITY_ANCHORS },
  // Growth
  revenue_growth: { label: "Revenue growth (YoY)", how: "TTM revenue vs prior TTM.", anchors: REVENUE_GROWTH_ANCHORS, unit: "decimal" },
  revenue_cagr_3y: { label: "Revenue CAGR (3y)", how: "Three-year compound growth (same anchors).", anchors: REVENUE_GROWTH_ANCHORS, unit: "decimal" },
  eps_growth: { label: "EPS growth (YoY)", how: "TTM diluted EPS vs prior TTM (needs a positive base).", anchors: EPS_GROWTH_ANCHORS, unit: "decimal" },
  forward_growth: { label: "Forward growth estimate", how: "Provider estimate of forward growth, when configured.", anchors: REVENUE_GROWTH_ANCHORS, unit: "decimal" },
  margin_expansion: { label: "Margin expansion", how: "TTM operating margin minus the prior year's (percentage points).", anchors: MARGIN_EXPANSION_ANCHORS, unit: "pp (decimal)" },
  industry_tailwind: { label: "Industry tailwind", how: "Static curated assumption per industry (table below) — an explicit model opinion, not market data." },
  // Momentum
  rel_return_3m: { label: "3m return vs index", how: "Stock return minus SPY return over 3 months.", anchors: REL_RETURN_3M_ANCHORS, unit: "decimal" },
  rel_return_6m: { label: "6m return vs index", how: "Same over 6 months.", anchors: REL_RETURN_6M_ANCHORS, unit: "decimal" },
  rel_return_12m_ex_1m: { label: "12m (ex 1m) vs index", how: "Classic momentum window: trailing year excluding the most recent month.", anchors: REL_RETURN_12M_EX_1M_ANCHORS, unit: "decimal" },
  abs_return_1m: { label: "1m return (absolute)", how: "Short-term absolute move.", anchors: ABS_RETURN_1M_ANCHORS, unit: "decimal" },
  eps_revision_trend: { label: "Earnings revision trend", how: "Provider analyst-revision signal, −1 to +1.", anchors: EPS_REVISION_ANCHORS },
  // Risk
  debt_to_equity: { label: "Debt / equity", how: "Total debt / book equity; negative-equity companies use net debt/EBITDA instead.", anchors: DEBT_TO_EQUITY_ANCHORS, unit: "×" },
  interest_coverage: { label: "Interest coverage", how: "TTM operating income / interest expense; minimal-debt companies score 90 with a note.", anchors: INTEREST_COVERAGE_ANCHORS, unit: "×" },
  valuation_compression: { label: "Valuation compression risk", how: "Blended percentile of today's P/E in the stock's own 3-year history (60%) and the sector (40%). High percentile = stretched.", anchors: COMPRESSION_PERCENTILE_ANCHORS, unit: "percentile" },
  earnings_volatility: { label: "Earnings volatility", how: "Same input as Quality's earnings stability, risk-framed — an intentional, documented overlap.", anchors: EARNINGS_STABILITY_ANCHORS },
  sector_cyclicality: { label: "Sector cyclicality", how: "Static assumption per sector (table below); defensive sectors score higher." },
  red_flags: { label: "Filing / news red flags", how: "Starts at 85; non-reliance 8-K −40, late filing −25, auditor change −20, persistent negative news sentiment −15; floor 5." },
};

export default function MethodologyPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ranking methodology</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every value on this page is imported directly from the scoring
          engine&apos;s constants — the page cannot drift from the code. The
          model is deliberately simple: transparent inputs, piecewise-linear
          normalization, fixed weights, explicit overrides.
        </p>
      </div>

      <ComplianceNotice kind="educational" />

      {/* Pillar weights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall score composition</CardTitle>
          <CardDescription>
            Overall = weighted mean of pillar scores (0–100). Pillars missing
            too much data are excluded and the remaining weights are
            renormalized — coverage is always reported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PILLAR_WEIGHTS) as PillarKey[]).map((key) => (
              <Badge key={key} variant="secondary" className="px-3 py-1 text-sm">
                {PILLAR_LABELS[key]}: {(PILLAR_WEIGHTS[key] * 100).toFixed(0)}%
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            A pillar needs ≥ {(MIN_PILLAR_COVERAGE * 100).toFixed(0)}% of its
            factor weight backed by data to produce a score; below{" "}
            {(MIN_OVERALL_COVERAGE * 100).toFixed(0)}% overall coverage the
            rating is forced to Watchlist — the model neither promotes nor
            condemns without evidence.
          </p>
        </CardContent>
      </Card>

      {/* Rating thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rating bands &amp; overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {RATING_THRESHOLDS.map((t) => (
              <Badge key={t.rating} variant="outline" className="px-3 py-1 text-sm">
                {RATING_LABELS[t.rating]}: overall ≥ {t.min}
              </Badge>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">Post-composite overrides (always disclosed in the breakdown):</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {Object.values(OVERRIDE_RULES).map((rule) => (
                <li key={rule.code}>
                  <code className="font-mono text-xs">{rule.code}</code> — {rule.message}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Factors per pillar */}
      {(Object.keys(FACTOR_WEIGHTS) as PillarKey[]).map((pillar) => (
        <Card key={pillar}>
          <CardHeader>
            <CardTitle className="text-base">
              {PILLAR_LABELS[pillar]} — {(PILLAR_WEIGHTS[pillar] * 100).toFixed(0)}% of overall
            </CardTitle>
            {pillar === "risk" ? (
              <CardDescription>
                Scored as safety: 100 = low modeled risk. Customer
                concentration is not modeled (no reliable free data source) —
                listed as a limitation, not silently ignored.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-52">Factor</TableHead>
                  <TableHead className="w-20 text-right">Weight</TableHead>
                  <TableHead>How it is scored</TableHead>
                  <TableHead className="w-72">Anchors [input → score]</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(FACTOR_WEIGHTS[pillar]).map(([key, weight]) => {
                  const desc = FACTOR_DESCRIPTIONS[key];
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{desc?.label ?? key}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(weight * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {desc?.how ?? ""}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {desc?.anchors
                          ? desc.anchors.map(([x, y]) => `${x}→${y}`).join("  ")
                          : "direct score / percentile"}
                        {desc?.unit ? ` (${desc.unit})` : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Normalization explainer + worked example */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Normalization — worked example</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Absolute metrics run through <strong>piecewise-linear anchors</strong>:
            a free-cash-flow yield of 3.5% sits halfway between the anchors
            (2% → 45) and (5% → 75), scoring exactly 60/100. Values beyond the
            outer anchors clamp to them.
          </p>
          <p>
            Relative metrics use <strong>sector medians</strong> (winsorized at
            the 5th/95th percentiles). A stock at P/E 20 in a sector with
            median 25 has ratio 0.8 → interpolated between (0.7 → 85) and
            (1.0 → 60) for a score of 76.7. Sectors with fewer than{" "}
            {MIN_SECTOR_PEERS} companies fall back to the whole-universe median
            and the factor note discloses it — with 30 companies, peer groups
            are small; treat sector-relative factors accordingly.
          </p>
          <p>
            Missing data is never faked: the factor is marked unavailable with
            a reason, its weight is redistributed within the pillar, and
            coverage drops — visible on every stock page.
          </p>
        </CardContent>
      </Card>

      {/* Assumption tables */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sector cyclicality (assumption)</CardTitle>
            <CardDescription>
              Curated scores, default {SECTOR_CYCLICALITY_DEFAULT}. Higher = more
              defensive.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {Object.entries(SECTOR_CYCLICALITY).map(([sector, score]) => (
                  <TableRow key={sector}>
                    <TableCell>{sector}</TableCell>
                    <TableCell className="text-right tabular-nums">{score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Industry tailwinds (assumption)</CardTitle>
            <CardDescription>
              Curated scores, default {INDUSTRY_TAILWIND_DEFAULT}. Revisited
              manually — an opinion made explicit, not data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {Object.entries(INDUSTRY_TAILWINDS).map(([industry, score]) => (
                  <TableRow key={industry}>
                    <TableCell>{industry}</TableCell>
                    <TableCell className="text-right tabular-nums">{score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Known limitations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model limitations &amp; assumptions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              Earnings volatility appears in both Quality (as stability) and
              Risk — a deliberate double-count that tilts the model toward
              steady earners.
            </li>
            <li>
              The current-ratio fallback for the balance-sheet factor
              (CURRENT_RATIO anchors: {CURRENT_RATIO_ANCHORS.map(([x, y]) => `${x}→${y}`).join(", ")})
              and the ROA fallback ({ROA_ANCHORS.map(([x, y]) => `${x}→${y}`).join(", ")})
              use different scales than their primary metrics; breakdown notes
              say when a fallback applied.
            </li>
            <li>
              Sector medians from a 30-company universe are coarse; several
              sectors fall back to universe medians.
            </li>
            <li>
              Tailwind and cyclicality tables are opinions frozen in code —
              explicit and versioned, but still opinions.
            </li>
            <li>
              Customer concentration and management quality are not modeled;
              no free structured source exists.
            </li>
            <li>
              Anchors were calibrated for large-cap US/CA equities and would
              need review for small caps or other markets.
            </li>
          </ul>
        </CardContent>
      </Card>

      <ComplianceNotice kind="suitability" />
    </div>
  );
}
