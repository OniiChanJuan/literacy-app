import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const [withParent]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE parent_item_id IS NOT NULL`);
  const [total]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items`);
  console.log(`Items with parent_item_id set: ${withParent.n} / ${total.n}`);

  // AoT: should show Season 1 as only visible
  const aot: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, year, vote_count, parent_item_id FROM items WHERE title ILIKE '%attack on titan%' AND type='tv' ORDER BY year
  `);
  console.log('\nAttack on Titan TV:');
  aot.forEach((r: any) => console.log(`  [${r.id}] ${r.parent_item_id ? '  (hidden→'+r.parent_item_id+')' : 'VISIBLE'} "${r.title}" (${r.year})`));

  // MHA: should show Season 1 only
  const mha: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, year, parent_item_id FROM items WHERE title ILIKE '%my hero academia%' AND type='tv' ORDER BY year
  `);
  console.log('\nMy Hero Academia TV:');
  mha.forEach((r: any) => console.log(`  [${r.id}] ${r.parent_item_id ? '  (hidden→'+r.parent_item_id+')' : 'VISIBLE'} "${r.title}" (${r.year})`));

  // Naruto Shippuden
  const naruto: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, year, parent_item_id FROM items WHERE title ILIKE '%shippud%' AND type='tv'
  `);
  console.log('\nNaruto Shippuden:');
  naruto.forEach((r: any) => console.log(`  [${r.id}] ${r.parent_item_id ? '  (hidden→'+r.parent_item_id+')' : 'VISIBLE'} "${r.title}" (${r.year})`));

  await prisma.$disconnect();
}
main().catch(console.error);
