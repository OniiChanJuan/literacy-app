import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Check Matrix items detail
  const matrix = await prisma.item.findMany({
    where: { title: { contains: 'matrix', mode: 'insensitive' }, isUpcoming: false },
    select: {
      id: true, title: true, type: true, year: true, tmdbId: true,
      people: true, awards: true, platforms: true, ext: true,
    },
    orderBy: { year: 'asc' },
  });
  console.log('=== MATRIX ITEMS DETAIL ===');
  for (const i of matrix) {
    console.log(`  [${i.id}] "${i.title}" (${i.type}, ${i.year}) tmdbId=${i.tmdbId}`);
    console.log(`    people: ${JSON.stringify(i.people).slice(0, 120)}`);
    console.log(`    ext:    ${JSON.stringify(i.ext).slice(0, 120)}`);
  }

  // Sample a movie item to see data structure
  const sampleMovie = await prisma.item.findFirst({
    where: { type: 'movie', isUpcoming: false, tmdbId: { not: null } },
    select: { id: true, title: true, people: true, awards: true, platforms: true, ext: true, cover: true },
  });
  console.log('\n=== SAMPLE MOVIE STRUCTURE ===');
  console.log(JSON.stringify(sampleMovie, null, 2).slice(0, 800));

  // Mistborn check
  const mistborn = await prisma.item.findMany({
    where: {
      OR: [
        { title: 'Mistborn' },
        { title: 'The Final Empire' },
        { title: { startsWith: 'Mistborn:' } },
      ],
    },
    select: {
      id: true, title: true, type: true, year: true, isbn: true, googleBooksId: true,
      description: true,
      _count: { select: { ratings: true, reviews: true } },
      franchiseItems: { include: { franchise: { select: { id: true, name: true } } } },
    },
  });
  console.log('\n=== MISTBORN CHECK ===');
  for (const i of mistborn) {
    console.log(`  [${i.id}] "${i.title}" (${i.year}) isbn=${i.isbn} gbId=${i.googleBooksId} ratings=${i._count.ratings} reviews=${i._count.reviews}`);
    console.log(`    desc: ${i.description.slice(0, 100)}`);
    console.log(`    franchises: ${i.franchiseItems.map(fi => `"${fi.franchise.name}"(#${fi.franchise.id})`).join(', ') || 'NONE'}`);
  }

  // Way of Kings check
  const wok = await prisma.item.findMany({
    where: { title: { contains: 'way of kings', mode: 'insensitive' } },
    select: {
      id: true, title: true, type: true, year: true, isbn: true, googleBooksId: true,
      description: true,
      _count: { select: { ratings: true, reviews: true } },
      franchiseItems: { include: { franchise: { select: { id: true, name: true } } } },
    },
  });
  console.log('\n=== WAY OF KINGS CHECK ===');
  for (const i of wok) {
    console.log(`  [${i.id}] "${i.title}" (${i.year}) isbn=${i.isbn} gbId=${i.googleBooksId} ratings=${i._count.ratings}`);
    console.log(`    desc: ${i.description.slice(0, 100)}`);
    console.log(`    franchises: ${i.franchiseItems.map(fi => `"${fi.franchise.name}"(#${fi.franchise.id})`).join(', ') || 'NONE'}`);
  }

  // Rhythm of War Part editions
  const rowParts = await prisma.item.findMany({
    where: { title: { contains: 'rhythm of war', mode: 'insensitive' } },
    select: {
      id: true, title: true, year: true, isbn: true, googleBooksId: true,
      _count: { select: { ratings: true, reviews: true } },
      franchiseItems: { include: { franchise: { select: { id: true, name: true } } } },
    },
  });
  console.log('\n=== RHYTHM OF WAR EDITIONS ===');
  for (const i of rowParts) {
    console.log(`  [${i.id}] "${i.title}" (${i.year}) isbn=${i.isbn} ratings=${i._count.ratings}`);
    console.log(`    franchises: ${i.franchiseItems.map(fi => `"${fi.franchise.name}"(#${fi.franchise.id})`).join(', ') || 'NONE'}`);
  }

  // Way of Kings Part Two
  const wokPart = await prisma.item.findMany({
    where: { title: { contains: 'way of kings part', mode: 'insensitive' } },
    select: {
      id: true, title: true, year: true, _count: { select: { ratings: true } },
      franchiseItems: { include: { franchise: { select: { id: true, name: true } } } },
    },
  });
  console.log('\n=== WAY OF KINGS PARTS ===');
  for (const i of wokPart) {
    console.log(`  [${i.id}] "${i.title}" ratings=${i._count.ratings}`);
    console.log(`    franchises: ${i.franchiseItems.map(fi => `"${fi.franchise.name}"(#${fi.franchise.id})`).join(', ') || 'NONE'}`);
  }

  // Empty franchises
  const allFranchises = await prisma.franchise.findMany({
    include: { _count: { select: { items: true } }, childFranchises: { select: { id: true } } },
  });
  const emptyFranchises = allFranchises.filter(f => f._count.items === 0);
  console.log('\n=== EMPTY FRANCHISES (to delete) ===');
  for (const f of emptyFranchises) {
    console.log(`  [#${f.id}] "${f.name}" parentId=${f.parentFranchiseId} children=${f.childFranchises.length}`);
  }

  // Single-item franchises detail
  const singleFranchises = allFranchises.filter(f => f._count.items === 1);
  console.log('\n=== SINGLE-ITEM FRANCHISES DETAIL ===');
  for (const f of singleFranchises) {
    const fi = await prisma.franchiseItem.findFirst({
      where: { franchiseId: f.id },
      include: { item: { select: { id: true, title: true, type: true, year: true } } },
    });
    const item = fi?.item;
    console.log(`  [#${f.id}] "${f.name}" → only item: [${item?.id}] "${item?.title}" (${item?.type}, ${item?.year})`);
  }

  // Phase 1D: Find orphan items matching existing franchise names (PREVIEW ONLY)
  console.log('\n=== PHASE 1D: PROPOSED FRANCHISE LINKS (exact prefix match) ===');
  const proposals = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT
      i.id as item_id,
      i.title as item_title,
      i.type as item_type,
      i.year as item_year,
      f.id as franchise_id,
      f.name as franchise_name,
      f_count.cnt as franchise_item_count
    FROM items i
    CROSS JOIN franchises f
    JOIN (
      SELECT franchise_id, COUNT(*) as cnt
      FROM franchise_items
      GROUP BY franchise_id
    ) f_count ON f_count.franchise_id = f.id
    WHERE i.is_upcoming = false
    AND NOT EXISTS (SELECT 1 FROM franchise_items fi WHERE fi.item_id = i.id)
    AND LENGTH(f.name) >= 5
    AND (
      i.title ILIKE f.name || ' %'
      OR i.title ILIKE f.name || ': %'
      OR i.title ILIKE f.name || ' - %'
    )
    AND f_count.cnt >= 2
    ORDER BY f.name, i.title
    LIMIT 300
  `;

  if (proposals.length === 0) {
    console.log('  No proposals generated.');
  } else {
    let lastFranchise = '';
    for (const p of proposals) {
      if (p.franchise_name !== lastFranchise) {
        console.log(`\n  Franchise: "${p.franchise_name}" (#${p.franchise_id}, ${p.franchise_item_count} existing items)`);
        lastFranchise = p.franchise_name;
      }
      console.log(`    → [${p.item_id}] "${p.item_title}" (${p.item_type}, ${p.item_year})`);
    }
    console.log(`\n  TOTAL PROPOSED LINKS: ${proposals.length}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
