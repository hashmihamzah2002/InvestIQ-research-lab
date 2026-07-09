import { prisma } from "@/lib/db/client";
import { parseJsonColumn, type RunStatus } from "@/lib/db/json";
import { StepResultsSchema, type StepResult } from "@/lib/pipeline/types";

export const STALE_AFTER_HOURS = 36;

export interface FreshnessInfo {
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  status: RunStatus | null;
  steps: StepResult[];
  isStale: boolean;
  staleReason: string | null;
}

/** Latest pipeline run + staleness verdict for the site-wide banner. */
export async function getFreshness(): Promise<FreshnessInfo> {
  const lastRun = await prisma.updateRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  const lastGoodRun = await prisma.updateRun.findFirst({
    where: { status: { in: ["SUCCESS", "PARTIAL"] } },
    orderBy: { startedAt: "desc" },
  });

  const lastSuccessAt = lastGoodRun?.finishedAt ?? null;
  let isStale = false;
  let staleReason: string | null = null;

  if (!lastSuccessAt) {
    isStale = true;
    staleReason = "No completed data refresh yet — run `npm run refresh`.";
  } else {
    const ageHours = (Date.now() - lastSuccessAt.getTime()) / 3_600_000;
    if (ageHours > STALE_AFTER_HOURS) {
      isStale = true;
      staleReason = `Last completed refresh was ${Math.floor(ageHours)}h ago (threshold ${STALE_AFTER_HOURS}h).`;
    } else if (lastRun && lastRun.status === "FAILED") {
      isStale = true;
      staleReason = "The most recent refresh failed; data shown is from an earlier run.";
    }
  }

  return {
    lastRunAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
    lastSuccessAt,
    status: (lastRun?.status as RunStatus | undefined) ?? null,
    steps: lastRun
      ? parseJsonColumn(StepResultsSchema, lastRun.stepsJson, [], "run.steps")
      : [],
    isStale,
    staleReason,
  };
}
