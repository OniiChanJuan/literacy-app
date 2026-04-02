import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // 1. Basic counts
  const [totalFranchises, totalItems, unlinkedItems] = await Promise.all([
    prisma.franchise.count(),
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linkedItems = totalItems - unlinkedItems;
  console.log('\n=== BASIC COUNTS ===');
  console.log(`Franchises: ${totalFranchises}`);
  console.log(`Total items: ${totalItems}`);
  console.log(`Items WITH franchise: ${linkedItems} (${((linkedItems/totalItems)*100).toFixed(1)}%)`);
  console.log(`Items WITHOUT franchise: ${unlinkedItems} (${((unlinkedItems/totalItems)*100).toFixed(1)}%)`);

  // 2. Single-item franchises
  const allFranchisesWithCount = await prisma.franchise.findMany({
    include: { _count: { select: { items: true } } },
  });
  const singleItemFranchises = allFranchisesWithCount.filter(f => f._count.items === 1);
  const emptyFranchises = allFranchisesWithCount.filter(f => f._count.items === 0);
  console.log(`\n=== FRANCHISE SIZES ===`);
  console.log(`  Empty (0 items): ${emptyFranchises.length}`);
  console.log(`  Single item: ${singleItemFranchises.length}`);
  console.log(`  2+ items: ${allFranchisesWithCount.filter(f => f._count.items >= 2).length}`);
  console.log(`  Sample single-item franchises:`);
  for (const f of singleItemFranchises.slice(0, 8)) {
    const fi = await prisma.franchiseItem.findFirst({ where: { franchiseId: f.id }, include: { item: { select: { title: true, type: true } } } });
    console.log(`    "${f.name}" → only: "${fi?.item?.title}" (${fi?.item?.type})`);
  }

  // 3. Cross-media franchises
  const crossMedia = await prisma.$queryRaw<any[]>`
    SELECT f.name, COUNT(DISTINCT i.type) as type_count,
           array_agg(DISTINCT i.type ORDER BY i.type) as types,
           COUNT(i.id) as item_count
    FROM franchises f
    JOIN franchise_items fi ON fi.franchise_id = f.id
    JOIN items i ON i.id = fi.item_id
    GROUP BY f.id, f.name
    HAVING COUNT(DISTINCT i.type) > 1
    ORDER BY COUNT(DISTINCT i.type) DESC, COUNT(i.id) DESC
    LIMIT 15
  `;
  console.log('\n=== CROSS-MEDIA FRANCHISES (top 15) ===');
  if (crossMedia.length === 0) console.log('  NONE — all franchises are single-type!');
  crossMedia.forEach(r => console.log(`  "${r.name}" — ${r.type_count} types: [${r.types.join(', ')}] (${r.item_count} items)`));

  // 4. Matrix items
  const matrixItems = await prisma.item.findMany({
    where: { title: { contains: 'matrix', mode: 'insensitive' }, isUpcoming: false },
    select: { id: true, title: true, type: true, franchiseItems: { include: { franchise: { select: { id: true, name: true } } } } },
    orderBy: { year: 'asc' },
  });
  console.log('\n=== MATRIX ITEMS IN CATALOG ===');
  if (matrixItems.length === 0) console.log('  None found!');
  matrixItems.forEach(i => {
    const f = i.franchiseItems.map(fi => `"${fi.franchise.name}"(#${fi.franchise.id})`).join(', ');
    console.log(`  [${i.type}] "${i.title}" → ${f || 'NO FRANCHISE'}`);
  });

  // 5. Animatrix
  const animatrix = await prisma.item.findMany({
    where: { title: { contains: 'animatrix', mode: 'insensitive' } },
    select: { id: true, title: true, type: true },
  });
  console.log(`\n=== ANIMATRIX ===`);
  console.log(animatrix.length > 0 ? `  Found: ${animatrix.map(a => `"${a.title}" (${a.type})`).join(', ')}` : '  NOT IN DATABASE');

  // 6. Cosmere / Sanderson
  const cosmere = await prisma.item.findMany({
    where: {
      OR: [
        { title: { contains: 'mistborn', mode: 'insensitive' } },
        { title: { contains: 'way of kings', mode: 'insensitive' } },
        { title: { contains: 'warbreaker', mode: 'insensitive' } },
        { title: { contains: 'elantris', mode: 'insensitive' } },
        { title: { contains: 'oathbringer', mode: 'insensitive' } },
        { title: { contains: 'rhythm of war', mode: 'insensitive' } },
        { title: { contains: 'words of radiance', mode: 'insensitive' } },
        { title: { contains: 'well of ascension', mode: 'insensitive' } },
        { title: { contains: 'hero of ages', mode: 'insensitive' } },
        { title: { contains: 'final empire', mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true, type: true, franchiseItems: { include: { franchise: { select: { id: true, name: true } } } } },
    orderBy: { title: 'asc' },
  });
  console.log('\n=== COSMERE/SANDERSON BOOKS ===');
  if (cosmere.length === 0) console.log('  None found!');
  cosmere.forEach(i => {
    const fs = i.franchiseItems.map(fi => `"${fi.franchise.name}"(#${fi.franchise.id})`).join(', ');
    console.log(`  [${i.type}] "${i.title}" → ${fs || 'NO FRANCHISE'}`);
  });

  // Check for Stormlight franchise
  const stormlightFranchise = await prisma.franchise.findFirst({ where: { name: { contains: 'stormlight', mode: 'insensitive' } } });
  const cosmereFranchise = await prisma.franchise.findFirst({ where: { name: { contains: 'cosmere', mode: 'insensitive' } } });
  console.log(`  Stormlight franchise in DB: ${stormlightFranchise ? `YES — "${stormlightFranchise.name}" (#${stormlightFranchise.id})` : 'NO'}`);
  console.log(`  Cosmere franchise in DB: ${cosmereFranchise ? `YES — "${cosmereFranchise.name}" (#${cosmereFranchise.id})` : 'NO'}`);

  // 7. addedBy breakdown
  const addedBy = await prisma.$queryRaw<any[]>`
    SELECT added_by, COUNT(*) as cnt FROM franchise_items GROUP BY added_by ORDER BY cnt DESC
  `;
  console.log('\n=== FRANCHISE LINKS BY SOURCE (addedBy) ===');
  addedBy.forEach(r => console.log(`  ${r.added_by}: ${r.cnt}`));

  // 8. Coverage by media type
  const byType = await prisma.$queryRaw<any[]>`
    SELECT i.type,
           COUNT(i.id) as total,
           COUNT(fi.item_id) as linked,
           COUNT(i.id) - COUNT(fi.item_id) as unlinked
    FROM items i
    LEFT JOIN franchise_items fi ON fi.item_id = i.id
    WHERE i.is_upcoming = false
    GROUP BY i.type
    ORDER BY total DESC
  `;
  console.log('\n=== FRANCHISE COVERAGE BY MEDIA TYPE ===');
  byType.forEach(r => console.log(`  ${r.type}: ${r.linked}/${r.total} linked (${r.total > 0 ? ((Number(r.linked)/Number(r.total))*100).toFixed(0) : 0}%)`));

  // 9. Orphan sequels sample
  const orphanSequels = await prisma.$queryRaw<any[]>`
    SELECT i.title, i.type
    FROM items i
    WHERE i.is_upcoming = false
    AND NOT EXISTS (SELECT 1 FROM franchise_items fi WHERE fi.item_id = i.id)
    AND (
      i.title ~* ' [2-9]$'
      OR i.title ILIKE '% 2' OR i.title ILIKE '% II' OR i.title ILIKE '% III'
      OR i.title ILIKE '%: part 2%' OR i.title ILIKE '%reloaded%' OR i.title ILIKE '%revolutions%'
      OR i.title ILIKE '% returns%' OR i.title ILIKE '%resurrection%'
    )
    LIMIT 25
  `;
  console.log('\n=== SAMPLE ORPHAN SEQUELS (no franchise, sequel word in title) ===');
  orphanSequels.forEach(r => console.log(`  [${r.type}] "${r.title}"`));

  // 10. Duplicate franchise names
  const dupes = await prisma.$queryRaw<any[]>`
    SELECT name, COUNT(*) as cnt FROM franchises GROUP BY name HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 10
  `;
  console.log('\n=== DUPLICATE FRANCHISE NAMES ===');
  dupes.length === 0 ? console.log('  None.') : dupes.forEach(r => console.log(`  "${r.name}" (${r.cnt} franchises)`));

  // 11. Biggest franchises
  const biggest = await prisma.franchise.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { items: { _count: 'desc' } },
    take: 10,
  });
  console.log('\n=== TOP 10 LARGEST FRANCHISES ===');
  biggest.forEach(f => console.log(`  "${f.name}" — ${f._count.items} items`));

  // 12. parentFranchiseId usage
  const withParent = await prisma.franchise.count({ where: { parentFranchiseId: { not: null } } });
  console.log(`\n=== FRANCHISE HIERARCHY ===`);
  console.log(`  Franchises with parentFranchiseId set: ${withParent}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
