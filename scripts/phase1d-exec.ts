/**
 * Phase 1D: Link orphan items to existing franchises
 * Executes clearly-correct + borderline matches.
 * Explicitly skips false-positive franchise/item combinations.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

// ─── Franchises to SKIP entirely (too many false positives due to generic names) ───
const SKIP_FRANCHISE_IDS = new Set([
  483, // "Kingdom" — Kingdom Hearts, Kingdom Rush etc. are NOT this franchise (Korean zombie manhwa)
  431, // "Monster" — Monster Hunter, Monster House etc. are NOT this franchise (Urasawa manga)
  505, // "Mission" — Mission: Impossible TV ≠ this franchise; Mission Yozakura Family ≠ this franchise
]);

// ─── Per-franchise item exclusions (specific false-positive items) ───
const EXCLUDED_ITEM_IDS = new Set([
  // Alien franchise (#446) — exclude unrelated games/shows that start with "Alien"
  17976, // "Alien Contact" (book) — unrelated
  13798, // "Alien Hominid" (game) — completely different game
  12954, // "Alien Shooter" (game) — unrelated shooter
  13845, // "Alien Soldier" (game) — Sega game, nothing to do with Ridley Scott's Alien
  13888, // "Alien Storm" (game) — Sega beat-em-up
  13001, // "Alien Swarm" (game) — Valve top-down shooter, unrelated
  19511, // "Alien Stage" (tv) — animated show, unrelated
  // Batman franchise (#409) — exclude academic book
  15065, // "Batman and Philosophy" (book) — academic analysis, not a creative franchise entry
  // Invincible franchise (#440) — exclude 1936 book with same word in title
  15242, // "Invincible Surmise" (book, 1936) — completely unrelated
]);

// ─── Additional manual links (borderline ones added explicitly) ───
const MANUAL_LINKS: Array<{ itemId: number; franchiseId: number; note: string }> = [
  // Alien franchise — these ARE valid Alien universe entries
  { itemId: 3643,  franchiseId: 446, note: '"Alien Resurrection" (movie) → Alien' },
  { itemId: 9168,  franchiseId: 446, note: '"Alien: Earth" (tv) → Alien' },
  { itemId: 11307, franchiseId: 446, note: '"Alien: Isolation" (game) → Alien' },
  { itemId: 13886, franchiseId: 446, note: '"Alien vs. Predator" (game) → Alien' },
  { itemId: 13700, franchiseId: 446, note: '"Alien 3" (game) → Alien' },
  { itemId: 13896, franchiseId: 446, note: '"Alien Trilogy" (game) → Alien' },
  // Wonder Woman (1E findings)
  { itemId: 3149,  franchiseId: 583, note: '"Wonder Woman" (movie, 2017) → Wonder Woman' },
  { itemId: 4273,  franchiseId: 583, note: '"Wonder Woman 1984" (movie) → Wonder Woman' },
  // Fate/Grand Order anime
  { itemId: 10878, franchiseId: 572, note: '"FGO: Absolute Demonic Front - Babylonia" (tv) → Fate/Grand Order' },
  { itemId: 19316, franchiseId: 572, note: '"FGO: Absolute Demonic Front - Babylonia" (tv, dup) → Fate/Grand Order' },
];

async function main() {
  console.log('════════════════════════════════════════════════════');
  console.log('PHASE 1D: LINKING ORPHAN SEQUELS TO FRANCHISES');
  console.log('════════════════════════════════════════════════════\n');

  // Step 1: Generate all proposals via SQL (same as diagnostic query)
  const allProposals = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT
      i.id   AS item_id,
      i.title AS item_title,
      i.type  AS item_type,
      i.year  AS item_year,
      f.id    AS franchise_id,
      f.name  AS franchise_name
    FROM items i
    CROSS JOIN franchises f
    JOIN (
      SELECT franchise_id, COUNT(*) AS cnt
      FROM franchise_items
      GROUP BY franchise_id
      HAVING COUNT(*) >= 2
    ) f_count ON f_count.franchise_id = f.id
    WHERE i.is_upcoming = false
    AND NOT EXISTS (SELECT 1 FROM franchise_items fi WHERE fi.item_id = i.id)
    AND LENGTH(f.name) >= 5
    AND (
      i.title ILIKE f.name || ' %'
      OR i.title ILIKE f.name || ': %'
      OR i.title ILIKE f.name || ' - %'
    )
    ORDER BY f.name, i.title
  `;

  console.log(`Raw proposals from DB: ${allProposals.length}`);

  // Step 2: Filter — skip excluded franchises and excluded item IDs
  const filtered = allProposals.filter(p => {
    if (SKIP_FRANCHISE_IDS.has(Number(p.franchise_id))) return false;
    if (EXCLUDED_ITEM_IDS.has(Number(p.item_id))) return false;
    return true;
  });

  console.log(`After filtering false positives: ${filtered.length}`);

  // Step 3: Execute filtered links
  let linked = 0;
  let skipped = 0;
  let errors = 0;
  const results: string[] = [];

  for (const p of filtered) {
    const itemId = Number(p.item_id);
    const franchiseId = Number(p.franchise_id);

    const existing = await prisma.franchiseItem.findUnique({
      where: { franchiseId_itemId: { franchiseId, itemId } },
    });

    if (existing) {
      skipped++;
      continue;
    }

    try {
      await prisma.franchiseItem.create({
        data: { franchiseId, itemId, addedBy: 'auto_pattern' },
      });
      linked++;
      const msg = `  ✅ [${p.item_type}] "${p.item_title}" (${p.item_year}) → "${p.franchise_name}"`;
      results.push(msg);
      console.log(msg);
    } catch (e: any) {
      errors++;
      console.log(`  ❌ Failed: "${p.item_title}" → "${p.franchise_name}": ${e.message}`);
    }
  }

  // Step 4: Execute manual/borderline links
  console.log('\n─── Manual/borderline links ───');
  for (const link of MANUAL_LINKS) {
    const existing = await prisma.franchiseItem.findUnique({
      where: { franchiseId_itemId: { franchiseId: link.franchiseId, itemId: link.itemId } },
    });
    if (existing) {
      console.log(`  ⏭  Already linked: ${link.note}`);
      skipped++;
      continue;
    }
    // Check item exists
    const item = await prisma.item.findUnique({ where: { id: link.itemId } });
    if (!item) {
      console.log(`  ⚠  Item #${link.itemId} not found: ${link.note}`);
      continue;
    }
    try {
      await prisma.franchiseItem.create({
        data: { franchiseId: link.franchiseId, itemId: link.itemId, addedBy: 'manual' },
      });
      linked++;
      console.log(`  ✅ ${link.note}`);
    } catch (e: any) {
      errors++;
      console.log(`  ❌ Failed: ${link.note}: ${e.message}`);
    }
  }

  // Step 5: Coverage report
  const [totalItems, unlinkedItems] = await Promise.all([
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linkedTotal = totalItems - unlinkedItems;

  console.log('\n════════════════════════════════════════════════════');
  console.log('PHASE 1D COMPLETE');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Newly linked:   ${linked}`);
  console.log(`  Already linked: ${skipped}`);
  console.log(`  Errors:         ${errors}`);
  console.log(`\n  Items with franchise: ${linkedTotal} / ${totalItems} (${((linkedTotal / totalItems) * 100).toFixed(1)}%)`);
  console.log(`  Previous (after 1A-1C): 1,204 / 22,475 (5.4%)`);
  console.log(`  Delta: +${linkedTotal - 1204} items`);

  // Step 6: Show which franchises were skipped and why
  console.log('\n─── Skipped franchises (false positives) ───');
  const skippedFranchises = allProposals.filter(p => SKIP_FRANCHISE_IDS.has(Number(p.franchise_id)));
  const skippedByFranchise: Record<string, number> = {};
  skippedFranchises.forEach(p => {
    skippedByFranchise[p.franchise_name] = (skippedByFranchise[p.franchise_name] || 0) + 1;
  });
  Object.entries(skippedByFranchise).forEach(([name, count]) =>
    console.log(`  "${name}": ${count} items skipped (false positives due to generic name)`)
  );

  console.log('\n─── Excluded specific items ───');
  const excludedItems = allProposals.filter(p => EXCLUDED_ITEM_IDS.has(Number(p.item_id)));
  excludedItems.forEach(p =>
    console.log(`  [${p.item_type}] "${p.item_title}" from franchise "${p.franchise_name}" — false positive`)
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());
