import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { log } from "@/lib/logging/logger";
import { getStockDetail } from "@/lib/queries/stock-detail";
import { generateReport } from "@/lib/reports/generate";

export const dynamic = "force-dynamic";

/**
 * GET /api/stocks/[ticker]/report
 *   ?format=md (default) | json
 *   ?download=1 -> attachment headers
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/stocks/[ticker]/report">,
): Promise<NextResponse | Response> {
  const { ticker } = await ctx.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "md";
  const download = url.searchParams.get("download") === "1";

  try {
    const detail = await getStockDetail(ticker);
    if (!detail) return jsonError(404, `Unknown ticker: ${ticker}`);
    const markdown = generateReport(detail, new Date());

    if (format === "json") {
      return NextResponse.json({ ticker: detail.company.ticker, markdown });
    }
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        ...(download
          ? {
              "content-disposition": `attachment; filename="investiq-${detail.company.ticker}-report.md"`,
            }
          : {}),
      },
    });
  } catch (err) {
    log.error("api.report.failed", { ticker, err });
    return jsonError(500, "Report generation failed");
  }
}
