"use client";

import { useState } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Loader2, Play } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { fmtPct } from "@/lib/format";
import type { BacktestResult } from "@/lib/backtest/engine";

const STRATEGIES = [
  { value: "overall", label: "Overall score (composite)" },
  { value: "valuation", label: "Valuation pillar" },
  { value: "quality", label: "Quality pillar" },
  { value: "growth", label: "Growth pillar" },
  { value: "momentum", label: "Momentum pillar" },
  { value: "risk", label: "Risk (safety) pillar" },
] as const;

export function BacktestClient() {
  const [strategy, setStrategy] = useState<string>("overall");
  const [topN, setTopN] = useState("8");
  const [rebalance, setRebalance] = useState<string>("quarterly");
  const [txnCostBps, setTxnCostBps] = useState("10");
  const [start, setStart] = useState("2022-01-01");
  const [end, setEnd] = useState("2026-06-30");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/backtest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategy,
          topN: Number(topN),
          rebalance,
          txnCostBps: Number(txnCostBps),
          start,
          end,
        }),
      });
      const body = (await response.json()) as
        | BacktestResult
        | { error: { message: string; issues?: { message: string }[] } };
      if (!response.ok) {
        const e = body as { error: { message: string; issues?: { message: string }[] } };
        throw new Error(
          e.error.issues?.map((i) => i.message).join("; ") ?? e.error.message,
        );
      }
      setResult(body as BacktestResult);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const chartConfig = {
    strategy: { label: "Strategy", color: "var(--chart-1)" },
    benchmark: { label: "SPY proxy", color: "var(--chart-3)" },
  } satisfies ChartConfig;

  return (
    <div className="space-y-4">
      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parameters</CardTitle>
          <CardDescription>
            Top-N equal-weight portfolio, rebalanced on the model&apos;s
            as-of-that-date scores (no look-ahead into unreported financials).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Ranking strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Top N (3-15)</Label>
            <Input type="number" min={3} max={15} className="h-8 w-20" value={topN} onChange={(e) => setTopN(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rebalance</Label>
            <Select value={rebalance} onValueChange={setRebalance}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Txn cost (bps)</Label>
            <Input type="number" min={0} max={100} className="h-8 w-24" value={txnCostBps} onChange={(e) => setTxnCostBps(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start (≥ 2021-07-01)</Label>
            <Input type="date" className="h-8 w-40" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End</Label>
            <Input type="date" className="h-8 w-40" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button size="sm" onClick={run} disabled={running}>
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {running ? "Scoring history…" : "Run backtest"}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">Backtest error: {error}</p> : null}

      {result ? (
        <>
          {/* Equity curve */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Growth of 1.00 — strategy vs SPY proxy
              </CardTitle>
              <CardDescription>
                {result.stats.tradingDays} trading days ·{" "}
                {result.rebalances.length} rebalances · total cost paid{" "}
                {fmtPct(result.stats.totalCostPaid)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <LineChart data={result.points}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={64}
                    tickFormatter={(v: string) => v.slice(0, 7)}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="strategy" stroke="var(--color-strategy)" strokeWidth={1.8} dot={false} />
                  <Line dataKey="benchmark" stroke="var(--color-benchmark)" strokeWidth={1.4} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total return" value={fmtPct(result.stats.totalReturn)} sub={`SPY: ${fmtPct(result.stats.benchmarkTotalReturn)}`} />
            <StatCard label="CAGR" value={fmtPct(result.stats.cagr)} sub={`SPY: ${fmtPct(result.stats.benchmarkCagr)}`} />
            <StatCard label="Max drawdown" value={fmtPct(result.stats.maxDrawdown)} sub={`SPY: ${fmtPct(result.stats.benchmarkMaxDrawdown)}`} />
            <StatCard
              label="Volatility (ann.)"
              value={fmtPct(result.stats.volatility)}
              sub={`Sharpe (0% cash): ${result.stats.sharpe ?? "—"} · avg turnover ${fmtPct(result.stats.avgTurnover, 0)}`}
            />
          </div>

          {/* Holdings history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Holdings by rebalance</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Top {topN} held</TableHead>
                    <TableHead className="w-24 text-right">Turnover</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rebalances.slice(-12).reverse().map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="tabular-nums">{r.date}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.tickers.join(" · ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPct(r.turnover, 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Limitations — prominent, always visible with results */}
          <Card className="border-amber-300 dark:border-amber-800">
            <CardHeader>
              <CardTitle className="text-base">
                Read before drawing conclusions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {result.limitations.map((l) => (
                  <li key={l.slice(0, 40)}>{l}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>
    </Card>
  );
}
