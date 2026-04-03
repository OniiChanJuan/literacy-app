import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function countBefore() {
  const r = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM items`;
  return Number(r[0].count);
}

async function main() {
  console.log('=== Book Duplicate Fix Script ===\n');

  const before = await countBefore();
  console.log(`Items in DB before: ${before}\n`);

  // ─────────────────────────────────────────────────────────────
  // FIX 1 — Delete Stormlight split-edition orphans
  //   15901 = Rhythm of War Part Two
  //   15902 = Rhythm of War Part One
  //   15905 = The Way of Kings Part Two
  // Cascade delete handles franchise_items, reviews, ratings, etc.
  // ─────────────────────────────────────────────────────────────
  console.log('FIX 1 — Deleting Stormlight split-edition orphans...');

  const stormlightIds = [15901, 15902, 15905];

  for (const id of stormlightIds) {
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) { console.log(`  ⚠️  Item ${id} not found — already deleted?`); continue; }
    await prisma.item.delete({ where: { id } });
    console.log(`  ✅ Deleted: "${item.title}" (${id})`);
  }

  // ─────────────────────────────────────────────────────────────
  // FIX 2 — Add Edgedancer (15897) to franchises 551 + 552
  // ─────────────────────────────────────────────────────────────
  console.log('\nFIX 2 — Adding Edgedancer (15897) to The Cosmere (551) and The Stormlight Archive (552)...');

  const edgedancerId = 15897;
  const franchiseIds = [551, 552];

  for (const franchiseId of franchiseIds) {
    // Check if already linked (avoid duplicate)
    const existing = await prisma.franchiseItem.findFirst({
      where: { itemId: edgedancerId, franchiseId },
    });
    if (existing) {
      console.log(`  ⚠️  Edgedancer already in franchise ${franchiseId} — skipping`);
      continue;
    }
    await prisma.franchiseItem.create({
      data: { itemId: edgedancerId, franchiseId, addedBy: 'manual' },
    });
    const franchise = await prisma.franchise.findUnique({ where: { id: franchiseId }, select: { name: true } });
    console.log(`  ✅ Added to franchise ${franchiseId} (${franchise?.name})`);
  }

  // ─────────────────────────────────────────────────────────────
  // FIX 3 — Delete Warhammer duplicate editions
  //   22436, 22440 = extra Fulgrim copies
  //   22379        = extra Horus Rising copy
  //   22435        = extra Heralds of the Siege copy
  //   22395        = extra Sabbat Martyr copy
  //   22437        = extra The Primarchs copy
  //   22473, 22479 = extra Trollslayer copies
  // ─────────────────────────────────────────────────────────────
  console.log('\nFIX 3 — Deleting Warhammer duplicate editions...');

  const warhammerIds = [22436, 22440, 22379, 22435, 22395, 22437, 22473, 22479];

  for (const id of warhammerIds) {
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) { console.log(`  ⚠️  Item ${id} not found — already deleted?`); continue; }
    await prisma.item.delete({ where: { id } });
    console.log(`  ✅ Deleted: "${item.title}" (${id}, year ${item.year})`);
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n=== Verification ===\n');

  const after = await countBefore();
  console.log(`Items in DB after:  ${after}`);
  console.log(`Items removed:      ${before - after} (expected 11)\n`);

  // Check no split editions remain linked
  const splitEditions = await prisma.$queryRaw<any[]>`
    SELECT i.id, i.title FROM items i
    JOIN franchise_items fi ON fi.item_id = i.id
    WHERE i.type = 'book' AND (
      i.title ILIKE '% Part One' OR i.title ILIKE '% Part Two'
      OR i.title ILIKE '% Part 1' OR i.title ILIKE '% Part 2'
    )
  `;
  console.log(`Split editions still in franchises: ${splitEditions.length} (should be 0)`);
  if (splitEditions.length > 0) splitEditions.forEach((r) => console.log(`  ⚠️  ${r.title} (${r.id})`));

  // Check Edgedancer is in both franchises
  const edgedancerLinks = await prisma.franchiseItem.findMany({
    where: { itemId: edgedancerId },
    include: { franchise: { select: { name: true } } },
  });
  console.log(`\nEdgedancer franchise links: ${edgedancerLinks.length} (should be 2)`);
  edgedancerLinks.forEach((l) => console.log(`  ✅ Franchise ${l.franchiseId}: ${(l as any).franchise.name}`));

  // Check Stormlight Archive universe (franchise 552)
  const stormlight = await prisma.franchiseItem.findMany({
    where: { franchiseId: 552 },
    include: { item: { select: { title: true, id: true } } },
    orderBy: { item: { title: 'asc' } },
  });
  console.log(`\nThe Stormlight Archive (franchise 552) — ${stormlight.length} items:`);
  stormlight.forEach((l) => console.log(`  - ${(l as any).item.title} (${l.itemId})`));

  // Check Warhammer franchise for remaining dupes
  const warhammerDupes = await prisma.$queryRaw<any[]>`
    SELECT title, COUNT(*) as count, array_agg(id) as ids
    FROM items WHERE id IN (
      SELECT item_id FROM franchise_items WHERE "franchiseId" IN (578, 594)
    )
    GROUP BY title HAVING COUNT(*) > 1
    ORDER BY title
  `;
  console.log(`\nWarhammer duplicate titles remaining: ${warhammerDupes.length} (should be 0)`);
  if (warhammerDupes.length > 0) warhammerDupes.forEach((r) => console.log(`  ⚠️  "${r.title}" × ${r.count}`));

  console.log('\n=== Done ===');
}

main()
  .catch(console.error)
  .finally(() => pool.end());
