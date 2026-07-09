import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/config/env";
import { log } from "@/lib/logging/logger";
import { todayUtc } from "@/lib/dates";
import { toJsonColumn, type RunStatus, type RunTrigger } from "@/lib/db/json";
import { ensureAdaptersRegistered } from "@/lib/providers/register";
import { FETCH_STEPS } from "./steps";
import { maintenanceStep, metricsStep, scoresStep } from "./compute-steps";
import type {
  PipelineStep,
  RefreshSummary,
  StepContext,
  StepResult,
} from "./types";

export interface RefreshOptions {
  trigger: RunTrigger;
  /** Run only these steps (names); default = all registered steps. */
  steps?: string[];
  /** Restrict per-company steps to these tickers. */
  tickers?: string[];
  /** Reference date (UTC midnight); defaults to today. */
  asOf?: Date;
  /** Injectable for tests; defaults to the app client. */
  db?: PrismaClient;
  /** Injectable for tests; defaults to FETCH_STEPS (+P5 compute steps). */
  pipeline?: PipelineStep[];
}

/**
 * Run the refresh pipeline. Hard guarantees:
 *  - never throws for data/provider problems — failures land in step results;
 *  - one failing step never prevents later steps from running;
 *  - every run is persisted as an UpdateRun row (status RUNNING -> final).
 */
/** Full daily pipeline: fetch everything, then derive, score, rank, prune. */
export const DEFAULT_PIPELINE: PipelineStep[] = [
  ...FETCH_STEPS,
  metricsStep,
  scoresStep,
  maintenanceStep,
];

export async function runRefresh(opts: RefreshOptions): Promise<RefreshSummary> {
  ensureAdaptersRegistered();
  const db = opts.db ?? prisma;
  const asOf = opts.asOf ?? todayUtc();
  const allSteps = opts.pipeline ?? DEFAULT_PIPELINE;
  const selected = opts.steps
    ? allSteps.filter((s) => opts.steps!.includes(s.name))
    : allSteps;

  const run = await db.updateRun.create({
    data: { trigger: opts.trigger, status: "RUNNING" satisfies RunStatus },
  });
  const runLog = log.child({ runId: run.id, trigger: opts.trigger });
  runLog.info("refresh.start", {
    steps: selected.map((s) => s.name),
    asOf: asOf.toISOString(),
  });

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      ticker: true,
      sector: true,
      industry: true,
      country: true,
      cik: true,
      isIndex: true,
      mockProfileJson: true,
    },
  });

  const ctx: StepContext = {
    db,
    companies,
    provider: { env: getEnv(), log: runLog, asOf, db },
    tickerFilter: opts.tickers?.length
      ? new Set(opts.tickers.map((t) => t.toUpperCase()))
      : undefined,
  };

  const results: StepResult[] = [];
  for (const step of allSteps) {
    if (!selected.includes(step)) {
      results.push({
        name: step.name,
        status: "SKIPPED",
        providers: [],
        items: 0,
        errors: [],
        durationMs: 0,
      });
      continue;
    }
    const started = Date.now();
    runLog.info("refresh.step.start", { step: step.name });
    try {
      const outcome = await step.run(ctx);
      const status =
        outcome.errors.length === 0
          ? "SUCCESS"
          : outcome.items > 0
            ? "PARTIAL"
            : "FAILED";
      results.push({
        name: step.name,
        status,
        providers: [...outcome.providers],
        items: outcome.items,
        errors: outcome.errors.slice(0, 20),
        durationMs: Date.now() - started,
      });
      runLog.info("refresh.step.done", {
        step: step.name,
        status,
        items: outcome.items,
        errorCount: outcome.errors.length,
      });
    } catch (err) {
      // A step-level throw is a bug in the step, but it must not take down
      // the rest of the run.
      results.push({
        name: step.name,
        status: "FAILED",
        providers: [],
        items: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        durationMs: Date.now() - started,
      });
      runLog.error("refresh.step.crashed", { step: step.name, err });
    }
  }

  const executed = results.filter((r) => r.status !== "SKIPPED");
  const status: RunStatus = executed.every((r) => r.status === "SUCCESS")
    ? "SUCCESS"
    : executed.some((r) => r.status === "SUCCESS" || r.status === "PARTIAL")
      ? "PARTIAL"
      : "FAILED";

  const finishedAt = new Date();
  await db.updateRun.update({
    where: { id: run.id },
    data: { status, finishedAt, stepsJson: toJsonColumn(results) },
  });
  runLog.info("refresh.done", { status, durationMs: finishedAt.getTime() - run.startedAt.getTime() });

  return {
    runId: run.id,
    status,
    startedAt: run.startedAt,
    finishedAt,
    steps: results,
  };
}
