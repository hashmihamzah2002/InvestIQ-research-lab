import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseSearchParams } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  series: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(120),
});

/** GET /api/macro — indicator catalog with recent observations. */
export async function GET(request: Request): Promise<NextResponse> {
  const parsed = parseSearchParams(QuerySchema, request.url);
  if (!parsed.ok) return parsed.response;
  try {
    const indicators = await prisma.macroIndicator.findMany({
      where: parsed.data.series
        ? { seriesId: parsed.data.series.toUpperCase() }
        : undefined,
      orderBy: { seriesId: "asc" },
    });
    const result = [];
    for (const ind of indicators) {
      const observations = await prisma.macroObservation.findMany({
        where: { indicatorId: ind.id },
        orderBy: { date: "desc" },
        take: parsed.data.limit,
      });
      result.push({
        seriesId: ind.seriesId,
        name: ind.name,
        unit: ind.unit,
        description: ind.description,
        observations: observations
          .reverse()
          .map((o) => ({ date: o.date.toISOString().slice(0, 10), value: o.value, source: o.source })),
      });
    }
    return NextResponse.json({ indicators: result });
  } catch (err) {
    log.error("api.macro.failed", { err });
    return jsonError(500, "Macro query failed");
  }
}
