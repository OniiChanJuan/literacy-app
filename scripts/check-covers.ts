import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Find franchise items with non-http covers
  const results: any[] = await prisma.$queryRawUnsafe(`
    SELECT fi.item_id, i.title, i.type, LEFT(i.cover, 80) as cover_start
    FROM franchise_items fi
    JOIN items i ON i.id = fi.item_id
    WHERE i.cover IS NULL OR i.cover = '' OR i.cover NOT LIKE 'http%'
    ORDER BY fi.franchise_id
  `);

  console.log(`Franchise items without valid cover URLs: ${results.length}`);
  for (const r of results) {
    console.log(`  ID ${r.item_id}: ${r.title} (${r.type}) | cover: "${r.cover_start || ""}"`);
  }

  // Count total franchise items
  const total: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM franchise_items`);
  console.log(`\nTotal franchise item entries: ${total[0].cnt}`);

  // Also check: items with 'linear-gradient' covers
  const gradients: any[] = await prisma.$queryRawUnsafe(`
    SELECT fi.item_id, i.title, LEFT(i.cover, 80) as cover_start
    FROM franchise_items fi
    JOIN items i ON i.id = fi.item_id
    WHERE i.cover LIKE 'linear%'
    LIMIT 10
  `);
  console.log(`\nFranchise items with gradient covers: ${gradients.length}`);
  for (const r of gradients) {
    console.log(`  ID ${r.item_id}: ${r.title} | ${r.cover_start}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
