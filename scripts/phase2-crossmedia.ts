/**
 * Phase 2C: Cross-media linking
 * Now that IGDB created franchises like "Monster Hunter", "Kingdom Hearts",
 * "Sonic The Hedgehog", "Street Fighter", etc., search for movies/TV/manga/books/comics
 * with matching title prefixes and link them.
 *
 * Also handles: for any franchise with 2+ items, try to find items in OTHER media types
 * whose title starts with the franchise name.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

// These franchise names are too generic — cross-media match would cause false positives
const SKIP_FRANCHISE_NAMES = new Set([
  'kingdom', 'monster', 'mission', 'dragon', 'star', 'dark', 'fire', 'ice',
  'disney', 'marvel', 'lego', 'nba', 'wwe', 'fifa', 'formula 1', 'forza',
  'tales of', 'tom clancy\'s', 'the king of fighters', 'dungeons & dragons',
  'might and magic', 'pro evolution soccer', 'colin mcrae',
]);

// Minimum franchise name length for cross-media matching (avoid short names)
const MIN_NAME_LENGTH = 8;

async function main() {
  console.log('════════════════════════════════════════════════════');
  console.log('PHASE 2C: CROSS-MEDIA TITLE MATCHING');
  console.log('════════════════════════════════════════════════════\n');

  // ── Step 1: Re-run exact-prefix query for ALL unlinked items vs ALL franchises
  // Using length >= 8 and excluding known false-positive franchise names
  console.log('Running cross-media prefix match query...');

  const proposals = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT
      i.id           AS item_id,
      i.title        AS item_title,
      i.type         AS item_type,
      i.year         AS item_year,
      f.id           AS franchise_id,
      f.name         AS franchise_name,
      f_count.cnt    AS franchise_count
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
    AND LENGTH(f.name) >= ${MIN_NAME_LENGTH}
    AND LOWER(f.name) NOT IN (
      'kingdom', 'monster', 'mission', 'disney', 'marvel', 'lego',
      'formula 1', 'forza', 'the king of fighters', 'pro evolution soccer',
      'colin mcrae', 'might and magic', 'dungeons & dragons',
      'tales of', 'tom clancy''s', 'wwe', 'fifa', 'nba'
    )
    AND (
      i.title ILIKE f.name || ' %'
      OR i.title ILIKE f.name || ': %'
      OR i.title ILIKE f.name || ' - %'
    )
    ORDER BY f.name, i.title
    LIMIT 500
  `;

  console.log(`Found ${proposals.length} new proposals\n`);

  // ── Step 2: Filter and execute
  // Additional manual exclusions
  const EXTRA_EXCLUDED_ITEMS = new Set([
    // "Sonic The Hedgehog" franchise — exclude books about sonic that aren't franchise media
    // "Mario" and "Mario Bros." — there's a Super Mario movie (2023) we want, but "Mario Bros." (1993) we may not
    // We'll let them through and inspect the list
  ]);

  // Franchises to entirely skip in cross-media (too generic for cross-media)
  const SKIP_FRANCHISE_IDS_CROSSMEDIA = new Set<number>();
  // Find IDs for the generic ones
  const genericFranchises = await prisma.franchise.findMany({
    where: {
      name: {
        in: ['Mario', 'Mario Bros.', 'Dragon', 'Star', 'Dark', 'Fire', 'Ice'],
        mode: 'insensitive',
      },
    },
    select: { id: true, name: true },
  });
  genericFranchises.forEach(f => {
    // Only skip if the name is very short (1-2 words of 4 chars)
    if (f.name.length < 8) SKIP_FRANCHISE_IDS_CROSSMEDIA.add(f.id);
  });

  let linked = 0;
  let skipped = 0;
  const summary: Map<string, string[]> = new Map();

  for (const p of proposals) {
    const franchiseId = Number(p.franchise_id);
    const itemId = Number(p.item_id);

    if (SKIP_FRANCHISE_IDS_CROSSMEDIA.has(franchiseId)) { skipped++; continue; }
    if (EXTRA_EXCLUDED_ITEMS.has(itemId)) { skipped++; continue; }

    // Skip if the item is the same type as most items already in the franchise
    // (This was Phase 1D's job — here we focus on cross-media, so prefer DIFFERENT types)
    // Actually, let's just link everything valid

    try {
      await prisma.franchiseItem.create({
        data: { franchiseId, itemId, addedBy: 'auto_pattern' },
      });
      linked++;
      if (!summary.has(p.franchise_name)) summary.set(p.franchise_name, []);
      summary.get(p.franchise_name)!.push(`[${p.item_type}] "${p.item_title}" (${p.item_year})`);
      console.log(`  ✅ [${p.item_type}] "${p.item_title}" → "${p.franchise_name}"`);
    } catch {
      // Already linked
    }
  }

  // ── Step 3: Summary
  console.log('\n════════════════════════════════════════════════════');
  console.log('CROSS-MEDIA PHASE COMPLETE');
  console.log('════════════════════════════════════════════════════');
  console.log(`  New links: ${linked}`);
  console.log(`  Skipped: ${skipped}`);

  const [total, unlinked] = await Promise.all([
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linkedTotal = total - unlinked;
  console.log(`\n  Items with franchise: ${linkedTotal}/${total} (${((linkedTotal/total)*100).toFixed(1)}%)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
