/**
 * One-time backfill: For every rating that doesn't have a corresponding library entry,
 * create one with status 'completed' and the rating date.
 *
 * Usage: npx tsx prisma/backfill-library.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Find all ratings that don't have a library entry
  const ratings = await prisma.rating.findMany({
    select: { userId: true, itemId: true, createdAt: true },
  });

  const existingEntries = await prisma.libraryEntry.findMany({
    select: { userId: true, itemId: true },
  });

  const entrySet = new Set(existingEntries.map((e) => `${e.userId}:${e.itemId}`));
  const missing = ratings.filter((r) => !entrySet.has(`${r.userId}:${r.itemId}`));

  console.log(`Found ${ratings.length} total ratings`);
  console.log(`Found ${existingEntries.length} existing library entries`);
  console.log(`Missing library entries for ${missing.length} ratings`);

  if (missing.length === 0) {
    console.log("Nothing to backfill!");
    return;
  }

  // Create library entries in batches of 100
  let created = 0;
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    await prisma.libraryEntry.createMany({
      data: batch.map((r) => ({
        userId: r.userId,
        itemId: r.itemId,
        status: "completed",
        completedAt: r.createdAt,
      })),
      skipDuplicates: true,
    });
    created += batch.length;
    console.log(`Created ${created}/${missing.length} library entries...`);
  }

  console.log(`Backfill complete! Created ${created} library entries.`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
