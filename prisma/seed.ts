/**
 * Seed the research universe: 30 companies (+ SPY index proxy) and the macro
 * indicator catalog. Idempotent — upserts by natural keys, safe to re-run.
 * Data loading happens separately via `npm run refresh`.
 */
import { createPrismaClient } from "@/lib/db/client";
import { seedUniverse } from "@/lib/pipeline/seed";

const prisma = createPrismaClient();

seedUniverse(prisma)
  .then(async ({ companies, indicators }) => {
    console.log(
      `Seeded ${companies} companies (incl. index proxies) and ${indicators} macro indicators.`,
    );
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
