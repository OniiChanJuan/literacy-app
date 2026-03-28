import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // How many items have parent_item_id set?
  const [withParent]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE parent_item_id IS NOT NULL`);
  const [total]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items`);
  console.log(`Items with parent_item_id set: ${withParent.n} / ${total.n}`);

  // How many franchises exist and how many franchise_items?
  const [fCount]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM franchises`);
  const [fiCount]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM franchise_items`);
  console.log(`Franchises: ${fCount.n}, Franchise items: ${fiCount.n}`);

  // What franchises exist for Attack on Titan?
  const aotFranchises: any[] = await prisma.$queryRawUnsafe(`
    SELECT f.id, f.name, COUNT(fi.item_id)::int as item_count
    FROM franchises f
    JOIN franchise_items fi ON fi.franchise_id = f.id
    WHERE f.name ILIKE '%attack on titan%' OR f.name ILIKE '%shingeki%'
    GROUP BY f.id, f.name
  `);
  console.log('\nAoT franchises:', JSON.stringify(aotFranchises));

  // How many tv items from Jikan (no tmdb_id) vs TMDB (has tmdb_id)?
  const tmdbTv: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='tv' AND tmdb_id IS NOT NULL`);
  const jikanTv: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='tv' AND mal_id IS NOT NULL AND tmdb_id IS NULL`);
  const bothTv: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='tv' AND tmdb_id IS NOT NULL AND mal_id IS NOT NULL`);
  console.log(`\nTV items - TMDB only: ${tmdbTv[0].n}, Jikan only: ${jikanTv[0].n}, Both IDs: ${bothTv[0].n}`);

  // Attack on Titan items with parent_item_id?
  const aotItems: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, year, tmdb_id, mal_id, vote_count, parent_item_id
    FROM items WHERE title ILIKE '%attack on titan%' AND type='tv'
    ORDER BY year, id
  `);
  console.log('\nAttack on Titan TV items:');
  aotItems.forEach((r: any) => console.log(`  id=${r.id} "${r.title}" y=${r.year} tmdb=${r.tmdb_id||'-'} mal=${r.mal_id||'-'} votes=${r.vote_count} parent=${r.parent_item_id||'-'}`));

  await prisma.$disconnect();
}
main().catch(console.error);
