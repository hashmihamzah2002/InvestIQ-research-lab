import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getEnv } from "@/lib/config/env";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";
import { runRefresh } from "@/lib/pipeline/refresh";

export const dynamic = "force-dynamic";

/** 403 for every admin operation when the instance runs as a public demo. */
function demoLock(): NextResponse | null {
  if (getEnv().DEMO_MODE === 1) {
    return jsonError(403, "Admin operations are disabled on this public demo instance.");
  }
  return null;
}

/**
 * POST — kick off a refresh in the background (local/long-lived server
 * deployments; serverless platforms would kill the detached promise — the
 * daily GitHub Actions workflow is the scheduled path there).
 * GET — latest run status for polling.
 */
let running = false;

export async function POST(): Promise<NextResponse> {
  const locked = demoLock();
  if (locked) return locked;
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
  const locked = demoLock();
  if (locked) return locked;
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
