import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";
import { runRefresh } from "@/lib/pipeline/refresh";

export const dynamic = "force-dynamic";

/**
 * POST — kick off a refresh in the background (local/long-lived server
 * deployments; serverless platforms would kill the detached promise — the
 * daily GitHub Actions workflow is the scheduled path there).
 * GET — latest run status for polling.
 */
let running = false;

export async function POST(): Promise<NextResponse> {
  if (running) {
    return NextResponse.json({ started: false, reason: "A refresh is already running." }, { status: 409 });
  }
  running = true;
  void runRefresh({ trigger: "API" })
    .catch((err) => log.error("api.refresh.crashed", { err }))
    .finally(() => {
      running = false;
    });
  return NextResponse.json({ started: true });
}

export async function GET(): Promise<NextResponse> {
  const latest = await prisma.updateRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({
    running,
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          trigger: latest.trigger,
          startedAt: latest.startedAt.toISOString(),
          finishedAt: latest.finishedAt?.toISOString() ?? null,
        }
      : null,
  });
}
