import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const [totalFranchises, totalItems, unlinkedItems] = await Promise.all([
    prisma.franchise.count(),
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linked = totalItems - unlinkedItems;

  console.log(`\n=== PHASE 2 FINAL COVERAGE ===`);
  console.log(`Franchises: ${totalFranchises}`);
  console.log(`Items with franchise:    ${linked} / ${totalItems} (${((linked/totalItems)*100).toFixed(1)}%)`);
  console.log(`Items without franchise: ${unlinkedItems} / ${totalItems}`);

  // By type
  const byType = await prisma.$queryRaw<any[]>`
    SELECT i.type,
      COUNT(i.id)::int as total,
      COUNT(fi.item_id)::int as linked
    FROM items i
    LEFT JOIN franchise_items fi ON fi.item_id = i.id
    WHERE i.is_upcoming = false
    GROUP BY i.type ORDER BY total DESC
  `;
  console.log('\nBy type:');
  byType.forEach(r => {
    const pct = r.total > 0 ? ((r.linked/r.total)*100).toFixed(0) : '0';
    console.log(`  ${r.type.padEnd(8)}: ${String(r.linked).padStart(4)} / ${String(r.total).padStart(5)} (${pct}%)`);
  });

  // addedBy breakdown
  const addedBy = await prisma.$queryRaw<any[]>`
    SELECT added_by, COUNT(*)::int as cnt FROM franchise_items GROUP BY added_by ORDER BY cnt DESC
  `;
  console.log('\nLinks by source:');
  addedBy.forEach(r => console.log(`  ${r.added_by}: ${r.cnt}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
