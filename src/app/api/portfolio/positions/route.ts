import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

const UpsertSchema = z.object({
  portfolioId: z.string().min(1),
  ticker: z.string().min(1).max(10),
  /** 0 removes the position. Hypothetical weights only — no share counts. */
  weightPct: z.number().min(0).max(100),
  note: z.string().max(500).optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  const body = UpsertSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid body", body.error.issues);

  const { portfolioId, weightPct, note } = body.data;
  const ticker = body.data.ticker.toUpperCase();

  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) return jsonError(404, "Unknown portfolio");
  const company = await prisma.company.findUnique({ where: { ticker } });
  if (!company || company.isIndex) return jsonError(404, `Unknown ticker: ${ticker}`);

  if (weightPct === 0) {
    await prisma.position.deleteMany({
      where: { portfolioId, companyId: company.id },
    });
  } else {
    await prisma.position.upsert({
      where: {
        portfolioId_companyId: { portfolioId, companyId: company.id },
      },
      create: { portfolioId, companyId: company.id, weightPct, note: note ?? null },
      update: { weightPct, note: note ?? null },
    });
  }
  log.info("portfolio.position_set", { portfolioId, ticker, weightPct });
  return NextResponse.json({ ok: true });
}
