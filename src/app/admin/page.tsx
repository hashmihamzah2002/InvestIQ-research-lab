import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { ComplianceNotice } from "@/components/compliance-notice";
import { FreshnessBanner } from "@/components/freshness-banner";
import { Badge } from "@/components/ui/badge";
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
import { fmtDateTime } from "@/lib/format";
import { getAdminOverview } from "@/lib/queries/admin";
import { cn } from "@/lib/utils";
import { CsvImportCard, RefreshNowButton } from "./admin-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Admin & Data Quality" };

export default async function AdminPage() {
  const data = await getAdminOverview();
  const latestRun = data.runs[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin &amp; data quality
          </h1>
          <p className="text-sm text-muted-foreground">
            Pipeline runs, provider health, coverage, and manual imports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FreshnessBanner />
          <RefreshNowButton />
        </div>
      </div>

      {/* Stale / missing summary */}
      {(data.staleCompanies.length > 0 || data.missingScores.length > 0) && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-base">Data gaps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.staleCompanies.length > 0 ? (
              <p>
                <strong>Stale data:</strong>{" "}
                <span className="font-mono">{data.staleCompanies.join(", ")}</span>
              </p>
            ) : null}
            {data.missingScores.length > 0 ? (
              <p>
                <strong>Missing scores:</strong>{" "}
                <span className="font-mono">{data.missingScores.join(", ")}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update runs</CardTitle>
          <CardDescription>
            Last successful update:{" "}
            {fmtDateTime(
              data.runs.find((r) => r.status === "SUCCESS" || r.status === "PARTIAL")
                ?.finishedAt ?? null,
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-3">
              {latestRun ? (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">
                    Latest run · {latestRun.trigger} ·{" "}
                    <StatusBadge status={latestRun.status} /> ·{" "}
                    {fmtDateTime(latestRun.startedAt)}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead>Providers</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latestRun.steps.map((s) => (
                        <TableRow key={s.name}>
                          <TableCell className="font-mono text-sm">{s.name}</TableCell>
                          <TableCell><StatusBadge status={s.status} /></TableCell>
                          <TableCell className="text-right tabular-nums">{s.items}</TableCell>
                          <TableCell className="text-sm">{s.providers.join(", ") || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(s.durationMs / 1000).toFixed(1)}s
                          </TableCell>
                          <TableCell className="max-w-72 truncate text-xs text-red-600">
                            {s.errors[0] ?? ""}
                            {s.errors.length > 1 ? ` (+${s.errors.length - 1})` : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {data.runs.slice(1).map((run) => (
                  <Badge key={run.id} variant="outline" className="gap-1.5">
                    {fmtDateTime(run.startedAt)} · {run.trigger} ·{" "}
                    <StatusBadge status={run.status} bare />
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Provider health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider health</CardTitle>
            <CardDescription>
              Rolling outcome per (provider, category). csv failures with no
              import files present are expected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.providerHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider calls recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Last success</TableHead>
                    <TableHead className="text-right">Consec. failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.providerHealth.map((h) => (
                    <TableRow key={`${h.provider}-${h.category}`}>
                      <TableCell className="font-mono text-sm">{h.provider}</TableCell>
                      <TableCell className="text-sm">{h.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDateTime(h.lastSuccessAt)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          h.consecutiveFailures > 0 && "font-medium text-amber-600",
                        )}
                      >
                        {h.consecutiveFailures}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Keys + chains */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>
              Presence only — secret values never reach this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableBody>
                {data.keys.map((k) => (
                  <TableRow key={k.name}>
                    <TableCell className="font-mono text-xs">{k.name}</TableCell>
                    <TableCell>
                      {k.configured ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="size-3.5" /> set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <XCircle className="size-3.5" /> not set
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{k.usedBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="space-y-1 text-sm">
              <p className="font-medium">Active provider chains</p>
              {data.chains.map((c) => (
                <p key={c.category} className="font-mono text-xs text-muted-foreground">
                  {c.category}: {c.chain.join(" → ")}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Coverage matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data coverage by company</CardTitle>
          <CardDescription>
            Counts + latest date per category. Green = fresh (prices ≤5d,
            fundamentals/filings ≤120d, news ≤21d).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Prices</TableHead>
                <TableHead>Fundamentals</TableHead>
                <TableHead>Filings</TableHead>
                <TableHead>News</TableHead>
                <TableHead>Metrics</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.coverage.map((row) => (
                <TableRow key={row.ticker}>
                  <TableCell className="font-mono font-medium">
                    {row.ticker}
                    {row.isIndex ? (
                      <Badge variant="secondary" className="ml-1.5 text-[10px]">index</Badge>
                    ) : null}
                  </TableCell>
                  <CoverageCell cell={row.prices} />
                  <CoverageCell cell={row.fundamentals} />
                  <CoverageCell cell={row.filings} />
                  <CoverageCell cell={row.news} />
                  <BoolCell value={row.hasMetrics || row.isIndex} />
                  <BoolCell value={row.hasScore || row.isIndex} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CsvImportCard />

      {/* Import history */}
      {data.imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {data.imports.map((j) => (
                  <TableRow key={`${j.filename}-${j.createdAt}`}>
                    <TableCell className="text-xs">{fmtDateTime(j.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{j.kind}</TableCell>
                    <TableCell className="text-sm">{j.filename}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {j.rowsOk} ok / {j.rowsFailed} failed
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <ComplianceNotice kind="data" />
    </div>
  );
}

function StatusBadge({ status, bare }: { status: string; bare?: boolean }) {
  const tone =
    status === "SUCCESS"
      ? "text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "PARTIAL"
        ? "text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-300"
        : status === "RUNNING"
          ? "text-sky-700 border-sky-300 bg-sky-50 dark:bg-sky-950 dark:text-sky-300"
          : status === "SKIPPED"
            ? "text-muted-foreground"
            : "text-red-700 border-red-300 bg-red-50 dark:bg-red-950 dark:text-red-300";
  if (bare) return <span className={cn("text-xs font-medium", tone)}>{status}</span>;
  return (
    <Badge variant="outline" className={cn("text-[10px]", tone)}>
      {status}
    </Badge>
  );
}

function CoverageCell({
  cell,
}: {
  cell: { count: number; latest: string | null; fresh: boolean };
}) {
  return (
    <TableCell>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs tabular-nums",
          cell.count === 0
            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
            : cell.fresh
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
        )}
      >
        {cell.count}
        {cell.latest ? <span className="opacity-70">· {cell.latest}</span> : null}
      </span>
    </TableCell>
  );
}

function BoolCell({ value }: { value: boolean }) {
  return (
    <TableCell>
      {value ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <XCircle className="size-4 text-red-600" />
      )}
    </TableCell>
  );
}
