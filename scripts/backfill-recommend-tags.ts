/**
 * Backfill recommendTag for imported ratings that were created before the
 * automatic tag inference was added to the batch import route.
 *
 * Rule:
 *   score 4-5 → 'recommend'
 *   score 3   → 'mixed'
 *   score 1-2 → 'skip'
 *
 * Only updates ratings where:
 *  - recommendTag IS NULL (not already set)
 *  - importSource IS NOT NULL (came from an import)
 *  - score IS NOT NULL
 *
 * Run: npx tsx scripts/backfill-recommend-tags.ts
 * Options:
 *   --dry-run   Print counts without writing to DB
 *   --all       Also update native (non-imported) ratings with null recommendTag
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL_RATINGS = args.includes("--all");

async function main() {
  console.log(`🏷️  Backfill recommendTag for imported ratings${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const where = {
    recommendTag: null,
    score: { not: null as any },
    ...(ALL_RATINGS ? {} : { importSource: { not: null as any } }),
  };

  const total = await prisma.rating.count({ where });
  console.log(`Found ${total} ratings with null recommendTag${ALL_RATINGS ? "" : " and an importSource"}\n`);

  if (total === 0) {
    console.log("Nothing to update.");
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    // Count by score bucket
    const counts = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN score >= 4 THEN 'recommend'
          WHEN score = 3  THEN 'mixed'
          ELSE 'skip'
        END AS bucket,
        COUNT(*) AS count
      FROM ratings
      WHERE recommend_tag IS NULL
        AND score IS NOT NULL
        ${ALL_RATINGS ? prisma.$queryRaw`AND 1=1` : prisma.$queryRaw`AND import_source IS NOT NULL`}
      GROUP BY bucket
    `;
    console.log("Would update:");
    for (const row of counts) {
      console.log(`  '${row.bucket}': ${row.count} ratings`);
    }
    await prisma.$disconnect();
    return;
  }

  // Perform the update in three batches (one per tag value)
  const recommend = await prisma.rating.updateMany({
    where: { ...where, score: { gte: 4 } },
    data: { recommendTag: "recommend" },
  });
  const mixed = await prisma.rating.updateMany({
    where: { ...where, score: 3 },
    data: { recommendTag: "mixed" },
  });
  const skip = await prisma.rating.updateMany({
    where: { ...where, score: { lte: 2 } },
    data: { recommendTag: "skip" },
  });

  console.log("✅ Done!");
  console.log(`  'recommend' (4-5 stars): ${recommend.count} ratings`);
  console.log(`  'mixed'     (3 stars):   ${mixed.count} ratings`);
  console.log(`  'skip'      (1-2 stars): ${skip.count} ratings`);
  console.log(`  Total updated: ${recommend.count + mixed.count + skip.count}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
