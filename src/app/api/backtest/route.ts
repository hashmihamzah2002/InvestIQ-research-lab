import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { utcDate } from "@/lib/dates";
import { log } from "@/lib/logging/logger";
import { runBacktestFromDb } from "@/lib/queries/backtest-runner";

export const dynamic = "force-dynamic";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return utcDate(y, m, d);
  });

const BodySchema = z
  .object({
    strategy: z.enum(["overall", "valuation", "quality", "growth", "momentum", "risk"]),
    topN: z.number().int().min(3).max(15),
    rebalance: z.enum(["monthly", "quarterly"]),
    txnCostBps: z.number().min(0).max(100),
    // Scores need ~1y of fundamentals + momentum windows: mock history
    // starts 2020-01, so 2021-07 is the earliest defensible start.
    start: isoDate.refine((d) => d.getTime() >= utcDate(2021, 7, 1).getTime(), {
      message: "start must be 2021-07-01 or later (score warm-up period)",
    }),
    end: isoDate,
  })
  .refine((v) => v.end.getTime() > v.start.getTime(), {
    message: "end must be after start",
  });

export async function POST(request: Request): Promise<NextResponse> {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(
      400,
      "Invalid backtest parameters",
      body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  try {
    const result = await runBacktestFromDb(body.data);
    return NextResponse.json(result);
  } catch (err) {
    log.error("api.backtest.failed", { err });
    return jsonError(
      500,
      err instanceof Error ? err.message : "Backtest failed",
    );
  }
}
