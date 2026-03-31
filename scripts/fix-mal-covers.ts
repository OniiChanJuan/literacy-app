/**
 * fix-mal-covers.ts
 *
 * Root cause: myanimelist.net blocks browser hotlinking for images.
 * Fix: replace myanimelist.net with cdn.myanimelist.net in all cover URLs.
 * cdn.myanimelist.net serves the same images with Access-Control-Allow-Origin: *
 * and does NOT block hotlinking from external domains.
 *
 * Run: npx dotenv-cli -e .env -- npx tsx scripts/fix-mal-covers.ts
 * Dry run: npx dotenv-cli -e .env -- npx tsx scripts/fix-mal-covers.ts --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Count affected items by type
  const counts: any[] = await prisma.$queryRawUnsafe(`
    SELECT type, COUNT(*)::int as cnt
    FROM items
    WHERE cover LIKE 'https://myanimelist.net/%'
    GROUP BY type ORDER BY cnt DESC
  `);

  const total = counts.reduce((s: number, r: any) => s + r.cnt, 0);
  console.log(`Items with myanimelist.net cover URLs (total: ${total}):`);
  for (const r of counts) {
    console.log(`  ${r.type.padEnd(10)} ${r.cnt}`);
  }

  if (total === 0) {
    console.log("Nothing to fix!");
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would replace myanimelist.net → cdn.myanimelist.net for all above items.");
    // Show 5 sample URLs before and after
    const samples: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, title, type, cover
      FROM items
      WHERE cover LIKE 'https://myanimelist.net/%'
      LIMIT 5
    `);
    console.log("\nSample before → after:");
    for (const s of samples) {
      const after = s.cover.replace('https://myanimelist.net/', 'https://cdn.myanimelist.net/');
      console.log(`  [${s.type}] ${s.title}`);
      console.log(`    before: ${s.cover}`);
      console.log(`    after:  ${after}`);
    }
    await prisma.$disconnect();
    return;
  }

  console.log("\nApplying fix...");
  const result: any[] = await prisma.$queryRawUnsafe(`
    UPDATE items
    SET cover = REPLACE(cover, 'https://myanimelist.net/', 'https://cdn.myanimelist.net/')
    WHERE cover LIKE 'https://myanimelist.net/%'
    RETURNING id
  `);

  console.log(`✓ Updated ${result.length} items`);
  console.log("All myanimelist.net cover URLs replaced with cdn.myanimelist.net");

  // Verify
  const remaining: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as cnt FROM items WHERE cover LIKE 'https://myanimelist.net/%'
  `);
  console.log(`Remaining myanimelist.net URLs: ${remaining[0].cnt}`);

  await prisma.$disconnect();
}

main().catch(console.error);
