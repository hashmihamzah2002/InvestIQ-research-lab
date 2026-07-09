import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink, FileText, Newspaper } from "lucide-react";
import { ComplianceNotice } from "@/components/compliance-notice";
import { FreshnessBanner } from "@/components/freshness-banner";
import { RatingBadge } from "@/components/rating-badge";
import { ScoreBreakdownView } from "@/components/score-breakdown";
import { SourceBadge } from "@/components/source-badge";
import {
  FcfChart,
  MarginTrendChart,
  PriceChart,
  RevenueEarningsChart,
} from "@/components/stock-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  fmtCurrency,
  fmtDate,
  fmtMult,
  fmtNum,
  fmtPct,
} from "@/lib/format";
import { getStockDetail } from "@/lib/queries/stock-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/stocks/[ticker]">,
): Promise<Metadata> {
  const { ticker } = await props.params;
  return { title: ticker.toUpperCase() };
}

export default async function StockDetailPage(props: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await props.params;
  const detail = await getStockDetail(ticker);
  if (!detail) notFound();

  const { company, score, metrics, dataQuality } = detail;
  const payload = score?.payload ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight">
              {company.ticker}
            </h1>
            <span className="text-lg text-muted-foreground">{company.name}</span>
            {score ? <RatingBadge rating={score.rating} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {company.sector} · {company.industry} · {company.exchange} ·{" "}
            {company.country}
            {company.website ? (
              <>
                {" · "}
                <a
                  className="underline-offset-4 hover:underline"
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  website
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <FreshnessBanner />
          <Button asChild size="sm" variant="outline">
            <Link href={`/reports/${company.ticker}`}>
              <FileText className="size-3.5" /> Research report
            </Link>
          </Button>
        </div>
      </div>

      {company.description ? (
        <p className="max-w-4xl text-sm text-muted-foreground">{company.description}</p>
      ) : null}

      {/* Rating reasoning */}
      {score ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              Overall score {score.overall.toFixed(1)}/100
              <span className="text-sm font-normal text-muted-foreground">
                rank #{score.rank ?? "—"} overall · #{score.sectorRank ?? "—"} in{" "}
                {company.sector} · coverage {(score.coverage * 100).toFixed(0)}%
              </span>
            </CardTitle>
            <CardDescription className="max-w-4xl leading-relaxed">
              {score.ratingReason}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not scored yet</CardTitle>
            <CardDescription>
              Run <code className="font-mono">npm run refresh</code> to compute
              metrics and scores.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Price chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Price (1 year, daily close)</CardTitle>
            <CardDescription>
              Last: {fmtNum(metrics.price)} ·{" "}
              {fmtPct(metrics.return12m, 1, true)} over 12m (
              {fmtPct(metrics.relReturn12m, 1, true)} vs SPY)
            </CardDescription>
          </div>
          <SourceBadge source={detail.priceSource} asOf={detail.priceSeries.at(-1)?.date} />
        </CardHeader>
        <CardContent>
          {detail.priceSeries.length > 0 ? (
            <PriceChart series={detail.priceSeries} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No price history loaded yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Valuation + key metrics */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valuation</CardTitle>
            <CardDescription>
              <SourceBadge
                source={dataQuality?.fundamentals?.source}
                asOf={metrics.asOf}
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricGrid
              rows={[
                ["Market cap", fmtCurrency(metrics.marketCap)],
                ["P/E (TTM)", fmtMult(metrics.pe)],
                ["Forward P/E", fmtMult(metrics.forwardPe)],
                ["PEG", fmtNum(metrics.peg, 2)],
                ["EV / EBITDA", fmtMult(metrics.evToEbitda)],
                ["Price / sales", fmtMult(metrics.priceToSales)],
                ["FCF yield", fmtPct(metrics.fcfYield)],
                ["Dividend yield", fmtPct(metrics.dividendYield)],
              ]}
            />
            <Separator className="my-3" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong>Forward P/E explained:</strong> price divided by
              estimated next-twelve-month earnings. Because it relies on
              forecasts, it embeds analyst assumptions the trailing P/E does
              not — the model compares both against the sector median and says
              which providers supplied the estimate.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality &amp; balance sheet</CardTitle>
            <CardDescription>
              {detail.balanceSheet ? (
                <SourceBadge
                  source={detail.balanceSheet.source}
                  asOf={detail.balanceSheet.periodEnd}
                />
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricGrid
              rows={[
                ["Gross margin", fmtPct(metrics.grossMargin)],
                ["Operating margin", fmtPct(metrics.operatingMargin)],
                ["Net margin", fmtPct(metrics.netMargin)],
                ["ROE", fmtPct(metrics.roe)],
                ["ROA", fmtPct(metrics.roa)],
                ["Debt / equity", fmtNum(metrics.debtToEquity, 2)],
                ["Net debt / EBITDA", fmtMult(metrics.netDebtToEbitda)],
                ["Interest coverage", fmtMult(metrics.interestCoverage)],
                ["Current ratio", fmtNum(metrics.currentRatio, 2)],
                ["FCF consistency", fmtPct(metrics.fcfConsistency, 0)],
              ]}
            />
            {detail.balanceSheet ? (
              <>
                <Separator className="my-3" />
                <MetricGrid
                  rows={[
                    ["Total assets", fmtCurrency(detail.balanceSheet.totalAssets)],
                    ["Total debt", fmtCurrency(detail.balanceSheet.totalDebt)],
                    ["Cash", fmtCurrency(detail.balanceSheet.cash)],
                    ["Book equity", fmtCurrency(detail.balanceSheet.totalEquity)],
                  ]}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* Trends */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue &amp; earnings (annual)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueEarningsChart data={detail.annualTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Margin trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MarginTrendChart data={detail.annualTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Free cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            <FcfChart data={detail.annualTrend} />
          </CardContent>
        </Card>
      </section>

      {/* Dividend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dividend profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {detail.dividend.ttmDividendsPaid && detail.dividend.ttmDividendsPaid > 0 ? (
            <MetricGrid
              rows={[
                ["Dividends paid (TTM)", fmtCurrency(detail.dividend.ttmDividendsPaid)],
                ["Dividend yield", fmtPct(detail.dividend.dividendYield)],
              ]}
            />
          ) : (
            <p className="text-muted-foreground">
              No dividends in the trailing twelve months of available data.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Score breakdown */}
      {payload ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Score breakdown — every factor, no black box
            </CardTitle>
            <CardDescription>
              Raw input → normalized 0-100 → weight → contribution. Hover the
              info icons for guards and comparison groups. Formulas live on the{" "}
              <Link href="/methodology" className="underline underline-offset-4">
                Methodology page
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreBreakdownView breakdown={payload.breakdown} />
          </CardContent>
        </Card>
      ) : null}

      {/* Narrative */}
      {payload ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <NarrativeCard title="Bull case" items={payload.narrative.bullCase} tone="positive" />
          <NarrativeCard title="Bear case" items={payload.narrative.bearCase} tone="negative" />
          <NarrativeCard title="Key risks" items={payload.narrative.keyRisks} tone="warning" />
          <NarrativeCard
            title="What would change my mind?"
            items={payload.narrative.changeMyMind}
            tone="neutral"
          />
        </section>
      ) : null}

      {/* Filings + news */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" /> Recent filings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detail.filings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No filings loaded.</p>
            ) : (
              <ul className="divide-y">
                {detail.filings.map((f) => (
                  <li key={`${f.form}-${f.filedAt}-${f.url}`} className="flex items-center gap-2 py-2 text-sm">
                    <Badge variant="secondary" className="w-16 justify-center font-mono">
                      {f.form}
                    </Badge>
                    <span className="w-24 text-xs text-muted-foreground">
                      {fmtDate(f.filedAt)}
                    </span>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {f.title ?? f.form}
                    </a>
                    {f.flags.map((flag) => (
                      <Badge key={flag} variant="destructive" className="text-[10px]">
                        {flag}
                      </Badge>
                    ))}
                    <SourceBadge source={f.source} />
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Newspaper className="size-4" /> Recent news &amp; research snippets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detail.news.length === 0 ? (
              <p className="text-sm text-muted-foreground">No news loaded.</p>
            ) : (
              <ul className="divide-y">
                {detail.news.map((n) => (
                  <li key={n.url} className="space-y-0.5 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        {fmtDate(n.publishedAt)}
                      </span>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate font-medium hover:underline"
                      >
                        {n.title}
                      </a>
                      {n.sentiment !== null ? (
                        <Badge
                          variant="outline"
                          className={
                            n.sentiment < -0.1
                              ? "border-red-300 text-red-700"
                              : n.sentiment > 0.1
                                ? "border-emerald-300 text-emerald-700"
                                : ""
                          }
                        >
                          {n.sentiment > 0 ? "+" : ""}
                          {n.sentiment.toFixed(2)}
                        </Badge>
                      ) : null}
                      <SourceBadge source={n.provider} />
                    </div>
                    {n.summary ? (
                      <p className="pl-26 text-xs text-muted-foreground">{n.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <ComplianceNotice kind="suitability" />
      <ComplianceNotice kind="data" />
    </div>
  );
}

function MetricGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-2 border-b border-dashed pb-1">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NarrativeCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "negative" | "warning" | "neutral";
}) {
  const border =
    tone === "positive"
      ? "border-l-emerald-400"
      : tone === "negative"
        ? "border-l-red-400"
        : tone === "warning"
          ? "border-l-amber-400"
          : "border-l-sky-400";
  return (
    <Card className={`border-l-4 ${border}`}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Generated deterministically from the score breakdown — not a human
          opinion.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {items.map((item) => (
            <li key={item.slice(0, 60)}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
