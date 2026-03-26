import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const results: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      regexp_replace(cover, '^https?://([^/]+).*', '\\1') as domain,
      COUNT(*)::int as cnt
    FROM items
    WHERE cover LIKE 'http%'
    GROUP BY 1
    ORDER BY cnt DESC
  `);

  console.log("Image domains used:");
  for (const r of results) {
    console.log(`  ${r.domain}: ${r.cnt} items`);
  }

  // Check which domains franchise items use
  const franchiseResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      regexp_replace(i.cover, '^https?://([^/]+).*', '\\1') as domain,
      COUNT(*)::int as cnt
    FROM franchise_items fi
    JOIN items i ON i.id = fi.item_id
    WHERE i.cover LIKE 'http%'
    GROUP BY 1
    ORDER BY cnt DESC
  `);

  console.log("\nFranchise item image domains:");
  for (const r of franchiseResults) {
    console.log(`  ${r.domain}: ${r.cnt} items`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
