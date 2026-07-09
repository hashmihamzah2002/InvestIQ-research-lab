"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RatingBadge } from "@/components/rating-badge";
import { ScoreBar } from "@/components/score-bar";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMult, fmtPct } from "@/lib/format";
import type { PortfolioView, WatchlistRow } from "@/lib/queries/portfolio";

interface Props {
  initialWatchlist: WatchlistRow[];
  initialPortfolios: PortfolioView[];
  universe: { ticker: string; name: string }[];
}

export function PortfolioClient({ initialWatchlist, initialPortfolios, universe }: Props) {
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [portfolios, setPortfolios] = useState(initialPortfolios);

  const reloadWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (res.ok) setWatchlist(((await res.json()) as { items: WatchlistRow[] }).items);
  }, []);
  const reloadPortfolios = useCallback(async () => {
    const res = await fetch("/api/portfolio");
    if (res.ok)
      setPortfolios(((await res.json()) as { portfolios: PortfolioView[] }).portfolios);
  }, []);

  return (
    <Tabs defaultValue="watchlist" className="space-y-4">
      <TabsList>
        <TabsTrigger value="watchlist">Watchlist ({watchlist.length})</TabsTrigger>
        <TabsTrigger value="portfolio">Mock portfolio</TabsTrigger>
      </TabsList>
      <TabsContent value="watchlist">
        <WatchlistTab
          rows={watchlist}
          universe={universe}
          onChanged={reloadWatchlist}
        />
      </TabsContent>
      <TabsContent value="portfolio">
        <PortfolioTab
          portfolios={portfolios}
          universe={universe}
          onChanged={reloadPortfolios}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------

function TickerSelect({
  universe,
  value,
  onChange,
  exclude,
}: {
  universe: { ticker: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  exclude?: Set<string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-52">
        <SelectValue placeholder="Pick a ticker" />
      </SelectTrigger>
      <SelectContent>
        {universe
          .filter((c) => !exclude?.has(c.ticker))
          .map((c) => (
            <SelectItem key={c.ticker} value={c.ticker}>
              {c.ticker} — {c.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function WatchlistTab({
  rows,
  universe,
  onChanged,
}: {
  rows: WatchlistRow[];
  universe: { ticker: string; name: string }[];
  onChanged: () => Promise<void>;
}) {
  const [ticker, setTicker] = useState("");
  const existing = new Set(rows.map((r) => r.ticker));

  const add = async () => {
    if (!ticker) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker }),
    });
    if (res.ok) {
      toast.success(`${ticker} added to watchlist`);
      setTicker("");
      await onChanged();
    } else {
      toast.error("Could not add ticker");
    }
  };

  const remove = async (t: string) => {
    const res = await fetch(`/api/watchlist?ticker=${t}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${t} removed`);
      await onChanged();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Watchlist</CardTitle>
        <CardDescription>
          Companies you are tracking — with their latest model scores for
          context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Add company</Label>
            <TickerSelect
              universe={universe}
              value={ticker}
              onChange={setTicker}
              exclude={existing}
            />
          </div>
          <Button size="sm" onClick={add} disabled={!ticker}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing on the watchlist yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">P/E</TableHead>
                <TableHead className="text-right">FCF yield</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell>
                    <Link
                      href={`/stocks/${r.ticker}`}
                      className="font-mono font-semibold hover:underline"
                    >
                      {r.ticker}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{r.name}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.sector}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMult(r.pe)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(r.fcfYield)}</TableCell>
                  <TableCell className="w-44">
                    <ScoreBar value={r.overallScore} />
                  </TableCell>
                  <TableCell>{r.rating ? <RatingBadge rating={r.rating} /> : "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${r.ticker}`}
                      onClick={() => remove(r.ticker)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PortfolioTab({
  portfolios,
  universe,
  onChanged,
}: {
  portfolios: PortfolioView[];
  universe: { ticker: string; name: string }[];
  onChanged: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(portfolios[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [ticker, setTicker] = useState("");
  const [weight, setWeight] = useState("");

  const active =
    portfolios.find((p) => p.id === selectedId) ?? portfolios[0] ?? null;

  const createPortfolio = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const { id } = (await res.json()) as { id: string };
      toast.success("Portfolio created");
      setNewName("");
      await onChanged();
      setSelectedId(id);
    }
  };

  const setPosition = async (t: string, weightPct: number) => {
    if (!active) return;
    const res = await fetch("/api/portfolio/positions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId: active.id, ticker: t, weightPct }),
    });
    if (res.ok) {
      await onChanged();
    } else {
      toast.error("Could not update position");
    }
  };

  const addPosition = async () => {
    const w = Number(weight);
    if (!ticker || !Number.isFinite(w) || w <= 0 || w > 100) {
      toast.error("Pick a ticker and a weight between 0 and 100");
      return;
    }
    await setPosition(ticker, w);
    toast.success(`${ticker} set to ${w}%`);
    setTicker("");
    setWeight("");
  };

  if (!active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a mock portfolio</CardTitle>
          <CardDescription>
            Hypothetical weights only — nothing is traded, nothing connects to
            a brokerage.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              className="h-8 w-56"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Quality tilt experiment"
            />
          </div>
          <Button size="sm" onClick={createPortfolio} disabled={!newName.trim()}>
            <Plus className="size-3.5" /> Create
          </Button>
        </CardContent>
      </Card>
    );
  }

  const a = active.analytics;
  const held = new Set(active.positions.map((p) => p.ticker));

  return (
    <div className="space-y-4">
      {/* Portfolio selector + creation */}
      <div className="flex flex-wrap items-end gap-2">
        {portfolios.length > 1 ? (
          <div className="space-y-1">
            <Label className="text-xs">Portfolio</Label>
            <Select value={active.id} onValueChange={setSelectedId}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm font-medium">{active.name}</p>
        )}
        <div className="ml-auto flex items-end gap-2">
          <Input
            className="h-8 w-48"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New portfolio name"
          />
          <Button size="sm" variant="outline" onClick={createPortfolio} disabled={!newName.trim()}>
            <Plus className="size-3.5" /> New
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {a.warnings.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
          {a.warnings.map((w) => (
            <p key={w.code + w.message} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                <Badge variant="outline" className="mr-2 text-[10px]">{w.code}</Badge>
                {w.message}
              </span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Positions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Hypothetical allocation</CardTitle>
            <CardDescription>
              {a.totalWeightPct.toFixed(1)}% invested · {a.cashPct.toFixed(1)}% cash
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Company</Label>
                <TickerSelect
                  universe={universe}
                  value={ticker}
                  onChange={setTicker}
                  exclude={held}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Weight %</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  className="h-8 w-24"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={addPosition} disabled={!ticker || !weight}>
                <Plus className="size-3.5" /> Add position
              </Button>
            </div>

            {active.positions.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No positions yet — add hypothetical weights above.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Overall</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.positions.map((p) => (
                    <TableRow key={p.ticker}>
                      <TableCell>
                        <Link
                          href={`/stocks/${p.ticker}`}
                          className="font-mono font-semibold hover:underline"
                        >
                          {p.ticker}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.sector}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.weightPct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="w-40">
                        <ScoreBar value={p.overallScore} />
                      </TableCell>
                      <TableCell>{p.rating ? <RatingBadge rating={p.rating} /> : "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${p.ticker}`}
                          onClick={() => setPosition(p.ticker, 0)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exposure &amp; risk</CardTitle>
            <CardDescription>Computed from the weights and latest model scores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Row label="Concentration (HHI)" value={a.hhi === null ? "—" : a.hhi.toFixed(3)} />
              <Row
                label="Effective holdings"
                value={a.effectiveHoldings === null ? "—" : a.effectiveHoldings.toFixed(1)}
              />
              <Row
                label="Largest position"
                value={
                  a.maxPosition
                    ? `${a.maxPosition.ticker} (${a.maxPosition.weightPct.toFixed(1)}%)`
                    : "—"
                }
              />
            </div>
            <div className="space-y-1.5">
              <p className="font-medium">Sector exposure</p>
              {a.sectorExposure.length === 0 ? (
                <p className="text-muted-foreground">No invested weight.</p>
              ) : (
                a.sectorExposure.map((s) => (
                  <div key={s.sector} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span>{s.sector}</span>
                      <span className="tabular-nums">{s.weightPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${s.weightPct > 40 ? "bg-amber-500" : "bg-sky-500"}`}
                        style={{ width: `${Math.min(100, s.weightPct)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-1.5">
              <p className="font-medium">Weighted model scores</p>
              <ScoreBar label="Valuation" value={a.weightedValuationScore} />
              <ScoreBar label="Overall" value={a.weightedOverallScore} />
              <ScoreBar label="Risk (safety)" value={a.weightedRiskScore} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
