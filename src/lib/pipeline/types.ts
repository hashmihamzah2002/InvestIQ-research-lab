import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ProviderContext } from "@/lib/providers/types";
import type { RunStatus } from "@/lib/db/json";

export const StepStatusSchema = z.enum(["SUCCESS", "PARTIAL", "FAILED", "SKIPPED"]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

/** Persisted into UpdateRun.stepsJson — keep backward compatible. */
export const StepResultSchema = z.object({
  name: z.string(),
  status: StepStatusSchema,
  /** Providers that actually served data, e.g. ["mock"] or ["finnhub","mock"]. */
  providers: z.array(z.string()),
  items: z.number(),
  errors: z.array(z.string()),
  durationMs: z.number(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const StepResultsSchema = z.array(StepResultSchema);

export interface RefreshSummary {
  runId: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date;
  steps: StepResult[];
}

/** Companies loaded once per run and shared across steps. */
export interface CompanyRow {
  id: string;
  ticker: string;
  sector: string;
  industry: string;
  country: string;
  cik: string | null;
  isIndex: boolean;
  mockProfileJson: string | null;
}

export interface StepContext {
  db: PrismaClient;
  companies: CompanyRow[];
  provider: ProviderContext;
  /** Restrict per-company steps to these tickers (CLI --tickers flag). */
  tickerFilter?: Set<string>;
}

export interface PipelineStep {
  name: string;
  run(ctx: StepContext): Promise<{ items: number; errors: string[]; providers: Set<string> }>;
}
