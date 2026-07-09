import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  LineChart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ComplianceNotice } from "@/components/compliance-notice";
import { FreshnessBanner } from "@/components/freshness-banner";
import { RatingBadge } from "@/components/rating-badge";
import { ScoreBar } from "@/components/score-bar";
import { SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { getDashboardData, type RankedStock } from "@/lib/queries/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data.asOf) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <ComplianceNotice kind="educational" />
        <Card>
          <CardHeader>
            <CardTitle>No data yet</CardTitle>
            <CardDescription>
              Run <code className="font-mono">npm run setup</code> (first time)
              or <code className="font-mono">npm run refresh</code> to load the
              universe and compute rankings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Model rankings as of {fmtDate(data.asOf)} · 30-company research universe
          </p>
        </div>
        <FreshnessBanner />
      </div>

      <ComplianceNotice kind="educational" />

      {/* Market overview */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.indexCard ? (
          <Card className="gap-2 py-4">
            <CardHeader className="pb-0">
              <CardDescription className="flex items-center gap-1">
                <LineChart className="size-3.5" /> S&amp;P 500 proxy (SPY)
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {fmtNum(data.indexCard.lastClose)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className={data.indexCard.return3m !== null && data.indexCard.return3m < 0 ? "text-red-600" : "text-emerald-600"}>
                {fmtPct(data.indexCard.return3m, 1, true)} over 3 months
              </p>
              <SourceBadge source={data.indexCard.source} asOf={data.indexCard.date} />
            </CardContent>
          </Card>
        ) : null}
        {data.macro.slice(0, 3).map((tile) => {
          const delta =
            tile.latest && tile.previous
              ? tile.latest.value - tile.previous.value
              : null;
          return (
            <Card key={tile.seriesId} className="gap-2 py-4">
              <CardHeader className="pb-0">
                <CardDescription>{tile.name}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {tile.latest ? `${tile.latest.value.toFixed(2)}%` : "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-muted-foreground">
                  {delta !== null ? (
                    <span className="inline-flex items-center gap-1">
                      {delta >= 0 ? (
                        <ArrowUpRight className="size-3.5" />
                      ) : (
                        <ArrowDownRight className="size-3.5" />
                      )}
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(2)}pp vs prior
                    </span>
                  ) : (
                    "no prior observation"
                  )}
                </p>
                <SourceBadge source={tile.source} asOf={tile.latest?.date} />
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Ranked lists */}
      <section className="grid gap-4 lg:grid-cols-2">
        <RankedList
          title="Top-ranked candidates"
          description="Highest overall model scores"
          icon={<TrendingUp className="size-4" />}
          stocks={data.topRanked}
          metric={(s) => <ScoreBar value={s.overallScore} className="w-40" />}
        />
        <RankedList
          title="Biggest valuation risks"
          description="Lowest valuation pillar scores (rich pricing vs the model's anchors)"
          icon={<TrendingDown className="size-4" />}
          stocks={data.valuationRisks}
          metric={(s) => <ScoreBar value={s.valuationScore} className="w-40" />}
        />
        <RankedList
          title="Improving fundamentals"
          description="Largest overall-score gains vs the previous snapshot"
          icon={<ArrowUpRight className="size-4" />}
          stocks={data.improving}
          emptyNote="Needs at least two snapshot dates — deltas appear after tomorrow's refresh."
          metric={(s) => (
            <span className="text-sm font-medium text-emerald-600">
              +{s.delta?.toFixed(1)} pts
            </span>
          )}
        />
        <RankedList
          title="Weak momentum"
          description="Lowest momentum pillar scores vs the index"
          icon={<TrendingDown className="size-4" />}
          stocks={data.weakMomentum}
          metric={(s) => <ScoreBar value={s.momentumScore} className="w-40" />}
        />
      </section>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" /> Recent filing &amp; news alerts
          </CardTitle>
          <CardDescription>
            Flagged or notable items from the last 14 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing notable in the window.
            </p>
          ) : (
            <ul className="divide-y">
              {data.alerts.map((alert) => (
                <li
                  key={`${alert.ticker}-${alert.url}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <Link
                    href={`/stocks/${alert.ticker}`}
                    className="w-14 font-mono font-medium hover:underline"
                  >
                    {alert.ticker}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(alert.date)}
                  </span>
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {alert.title}
                  </a>
                  {alert.flags.map((flag) => (
                    <Badge key={flag} variant="destructive" className="text-[10px]">
                      {flag}
                    </Badge>
                  ))}
                  {alert.sentiment !== null ? (
                    <Badge
                      variant="outline"
                      className={
                        alert.sentiment < 0
                          ? "border-red-300 text-red-700"
                          : "border-emerald-300 text-emerald-700"
                      }
                    >
                      sentiment {alert.sentiment > 0 ? "+" : ""}
                      {alert.sentiment.toFixed(2)}
                    </Badge>
                  ) : null}
                  <SourceBadge source={alert.source} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ComplianceNotice kind="data" />
    </div>
  );
}

function RankedList({
  title,
  description,
  icon,
  stocks,
  metric,
  emptyNote,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  stocks: RankedStock[];
  metric: (s: RankedStock) => React.ReactNode;
  emptyNote?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {stocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyNote ?? "No entries."}
          </p>
        ) : (
          <ul className="divide-y">
            {stocks.map((s) => (
              <li key={s.ticker} className="flex items-center gap-3 py-2">
                <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                  {s.rank ?? "—"}
                </span>
                <Link
                  href={`/stocks/${s.ticker}`}
                  className="w-14 font-mono text-sm font-semibold hover:underline"
                >
                  {s.ticker}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {s.name}
                </span>
                {metric(s)}
                <RatingBadge rating={s.rating} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
