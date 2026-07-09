import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";
import { getPortfolios } from "@/lib/queries/portfolio";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ portfolios: await getPortfolios() });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const body = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid body", body.error.issues);
  const portfolio = await prisma.portfolio.create({
    data: { name: body.data.name, description: body.data.description ?? null },
  });
  log.info("portfolio.created", { id: portfolio.id });
  return NextResponse.json({ id: portfolio.id });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError(400, "id query parameter required");
  await prisma.portfolio.delete({ where: { id } }).catch(() => null);
  log.info("portfolio.deleted", { id });
  return NextResponse.json({ ok: true });
}
