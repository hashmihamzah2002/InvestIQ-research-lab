import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { log } from "@/lib/logging/logger";
import { getStockDetail } from "@/lib/queries/stock-detail";

export const dynamic = "force-dynamic";

/** GET /api/stocks/[ticker] — full detail bundle for one company. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/stocks/[ticker]">,
): Promise<NextResponse> {
  const { ticker } = await ctx.params;
  try {
    const detail = await getStockDetail(ticker);
    if (!detail) return jsonError(404, `Unknown ticker: ${ticker}`);
    return NextResponse.json(detail);
  } catch (err) {
    log.error("api.stock_detail.failed", { ticker, err });
    return jsonError(500, "Stock detail query failed");
  }
}
