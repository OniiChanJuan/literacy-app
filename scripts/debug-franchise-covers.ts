import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Find Ghost in the Shell franchise
  const franchises = await prisma.franchise.findMany({
    where: { name: { contains: "Ghost" } },
    include: {
      items: {
        include: {
          item: { select: { id: true, title: true, type: true, cover: true } },
        },
      },
    },
  });

  for (const f of franchises) {
    console.log(`\nFranchise: ${f.name} (id: ${f.id})`);
    console.log(`  Total items: ${f.items.length}`);
    for (const fi of f.items) {
      const c = fi.item.cover;
      let status = "EMPTY";
      if (c && c.startsWith("http")) status = `OK: ${c.substring(0, 70)}`;
      else if (c) status = `NON-HTTP: ${c.substring(0, 70)}`;
      console.log(`  ${fi.item.id} | ${fi.item.type.padEnd(6)} | ${fi.item.title.padEnd(45)} | ${status}`);
    }
  }

  // Also check: ALL franchise items with empty/non-http covers across ALL franchises
  const allBad: any[] = await prisma.$queryRawUnsafe(`
    SELECT fi.franchise_id, f.name as franchise_name, fi.item_id, i.title, i.type,
           CASE WHEN i.cover = '' THEN 'EMPTY'
                WHEN i.cover IS NULL THEN 'NULL'
                WHEN i.cover NOT LIKE 'http%' THEN 'NON-HTTP'
                ELSE 'OK' END as cover_status,
           LEFT(i.cover, 60) as cover_preview
    FROM franchise_items fi
    JOIN items i ON i.id = fi.item_id
    JOIN franchises f ON f.id = fi.franchise_id
    WHERE i.cover IS NULL OR i.cover = '' OR i.cover NOT LIKE 'http%'
    ORDER BY f.name, i.title
  `);

  console.log(`\n\n=== ALL franchise items with missing/bad covers: ${allBad.length} ===`);
  for (const r of allBad) {
    console.log(`  [${r.franchise_name}] ${r.item_id} | ${r.type} | ${r.title} | ${r.cover_status}: ${r.cover_preview || ""}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
