/**
 * Exit 0 when the database is migrated AND seeded (companies exist),
 * exit 1 otherwise. Used by the container start command to decide whether
 * seed+refresh is needed (images with baked demo data skip it -> fast boot).
 */
import { createPrismaClient } from "@/lib/db/client";

const prisma = createPrismaClient();

prisma.company
  .count()
  .then(async (count) => {
    await prisma.$disconnect();
    process.exit(count > 0 ? 0 : 1);
  })
  .catch(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
