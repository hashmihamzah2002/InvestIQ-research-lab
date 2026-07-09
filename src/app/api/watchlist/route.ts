import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";
import { getWatchlist } from "@/lib/queries/portfolio";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ items: await getWatchlist() });
}

const AddSchema = z.object({
  ticker: z.string().min(1).max(10),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const body = AddSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "Invalid body", body.error.issues);
  }
  const ticker = body.data.ticker.toUpperCase();
  const company = await prisma.company.findUnique({ where: { ticker } });
  if (!company || company.isIndex) {
    return jsonError(404, `Unknown ticker: ${ticker}`);
  }
  await prisma.watchlistItem.upsert({
    where: { companyId: company.id },
    create: { companyId: company.id, note: body.data.note ?? null },
    update: { note: body.data.note ?? null },
  });
  log.info("watchlist.added", { ticker });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const ticker = new URL(request.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return jsonError(400, "ticker query parameter required");
  const company = await prisma.company.findUnique({ where: { ticker } });
  if (!company) return jsonError(404, `Unknown ticker: ${ticker}`);
  await prisma.watchlistItem.deleteMany({ where: { companyId: company.id } });
  log.info("watchlist.removed", { ticker });
  return NextResponse.json({ ok: true });
}
