import { NextResponse } from "next/server";
import { jsonError, parseSearchParams } from "@/lib/api";
import { log } from "@/lib/logging/logger";
import { runScreener, ScreenerQuerySchema } from "@/lib/queries/screener";

export const dynamic = "force-dynamic";

/** GET /api/stocks — screener with Zod-validated filters. */
export async function GET(request: Request): Promise<NextResponse> {
  const parsed = parseSearchParams(ScreenerQuerySchema, request.url);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await runScreener(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    log.error("api.stocks.failed", { err });
    return jsonError(500, "Screener query failed");
  }
}
