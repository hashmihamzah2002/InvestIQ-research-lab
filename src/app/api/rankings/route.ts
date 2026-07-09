import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { log } from "@/lib/logging/logger";
import { runScreener, ScreenerQuerySchema } from "@/lib/queries/screener";

export const dynamic = "force-dynamic";

/** GET /api/rankings — the full ranked universe (screener with defaults). */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await runScreener(ScreenerQuerySchema.parse({}));
    return NextResponse.json({
      asOf: result.asOf,
      rankings: result.rows.map((r) => ({
        rank: r.rank,
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        overallScore: r.overallScore,
        rating: r.rating,
        valuationScore: r.valuationScore,
        qualityScore: r.qualityScore,
        growthScore: r.growthScore,
        momentumScore: r.momentumScore,
        riskScore: r.riskScore,
      })),
    });
  } catch (err) {
    log.error("api.rankings.failed", { err });
    return jsonError(500, "Rankings query failed");
  }
}
