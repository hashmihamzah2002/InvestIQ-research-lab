import type { PrismaClient } from "@/generated/prisma/client";
import { toJsonColumn } from "@/lib/db/json";
import { MACRO_CATALOG } from "@/lib/macro/catalog";
import { SEED_COMPANIES } from "../../../prisma/data/universe";

/**
 * Upsert the company universe and macro indicator catalog. Idempotent.
 * Shared by `prisma/seed.ts` (CLI) and integration tests (scratch DBs).
 */
export async function seedUniverse(
  db: PrismaClient,
): Promise<{ companies: number; indicators: number }> {
  let companies = 0;
  for (const c of SEED_COMPANIES) {
    const data = {
      name: c.name,
      sector: c.sector,
      industry: c.industry,
      exchange: c.exchange,
      country: c.country,
      cik: c.cik,
      website: c.website,
      description: c.description,
      isIndex: c.isIndex ?? false,
      isActive: true,
      mockProfileJson: toJsonColumn(c.mockProfile),
    };
    await db.company.upsert({
      where: { ticker: c.ticker },
      create: { ticker: c.ticker, ...data },
      update: data,
    });
    companies++;
  }

  let indicators = 0;
  for (const m of MACRO_CATALOG) {
    await db.macroIndicator.upsert({
      where: { seriesId: m.seriesId },
      create: {
        seriesId: m.seriesId,
        name: m.name,
        unit: m.unit,
        description: m.description,
      },
      update: { name: m.name, unit: m.unit, description: m.description },
    });
    indicators++;
  }

  return { companies, indicators };
}
