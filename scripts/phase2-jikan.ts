/**
 * Phase 2D: Manga + Anime series linking via Jikan (MAL API)
 * Uses MAL's "related" data to find sequels/prequels/side stories
 * and links them into the same franchise.
 *
 * Jikan rate limit: 3 req/s (free), we use 400ms delay
 * ~1768 manga malIds + 1657 TV anime malIds = ~3425 calls → ~23 min
 * We batch only UNLINKED items to save time.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const DELAY_MS = 400; // ~2.5 req/s to be safe within Jikan's 3/s limit

// Types to process
const MAL_MEDIA_TYPES: Array<{ dbType: string; jikanType: 'manga' | 'anime' }> = [
  { dbType: 'manga', jikanType: 'manga' },
  { dbType: 'tv',    jikanType: 'anime' },
];

// Relation types we care about (sequel, prequel, side story etc.)
const LINK_RELATION_TYPES = new Set([
  'Sequel', 'Prequel', 'Side Story', 'Alternative Version',
  'Full Story', 'Summary', 'Spin-off', 'Other',
]);

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function jikanGet(path: string): Promise<any> {
  const url = `${JIKAN_BASE}${path}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (res.status === 429) {
    console.log('  Rate limited by Jikan, waiting 3s...');
    await sleep(3000);
    return jikanGet(path);
  }
  if (!res.ok) return null;
  return res.json();
}

// Build a map of malId → db item for quick lookup
type DbItem = { id: number; title: string; malId: number; franchiseItems: { franchiseId: number }[] };

async function main() {
  console.log('════════════════════════════════════════════════════');
  console.log('PHASE 2D: JIKAN/MAL SERIES LINKING');
  console.log('════════════════════════════════════════════════════\n');

  // Build lookups for ALL items with malId (linked + unlinked) so we can find matches
  const allMangaItems = await prisma.item.findMany({
    where: { type: 'manga', malId: { not: null }, isUpcoming: false },
    select: { id: true, title: true, malId: true, franchiseItems: { select: { franchiseId: true } } },
  });
  const allAnimeItems = await prisma.item.findMany({
    where: { type: 'tv', malId: { not: null }, isUpcoming: false },
    select: { id: true, title: true, malId: true, franchiseItems: { select: { franchiseId: true } } },
  });

  const mangaByMalId = new Map(allMangaItems.map(i => [i.malId!, i]));
  const animeByMalId = new Map(allAnimeItems.map(i => [i.malId!, i]));

  console.log(`Manga with malId: ${allMangaItems.length} (${allMangaItems.filter(i => i.franchiseItems.length === 0).length} unlinked)`);
  console.log(`Anime TV with malId: ${allAnimeItems.length} (${allAnimeItems.filter(i => i.franchiseItems.length === 0).length} unlinked)\n`);

  let totalLinked = 0;
  let newFranchises = 0;
  let apiCalls = 0;

  for (const { dbType, jikanType } of MAL_MEDIA_TYPES) {
    const allItems: DbItem[] = dbType === 'manga' ? allMangaItems as any : allAnimeItems as any;
    const byMalId = dbType === 'manga' ? mangaByMalId : animeByMalId;
    const unlinkedItems = allItems.filter(i => i.franchiseItems.length === 0);

    console.log(`\n─── Processing ${dbType} (${unlinkedItems.length} unlinked) ───`);

    // Track which malIds we've already resolved into franchise groups
    // to avoid redundant API calls
    const resolvedGroups = new Map<number, number>(); // malId → franchiseId

    let processed = 0;

    for (const item of unlinkedItems) {
      processed++;

      // Check if this malId was already resolved via a sibling's related lookup
      if (resolvedGroups.has(item.malId!)) {
        const franchiseId = resolvedGroups.get(item.malId!)!;
        try {
          await prisma.franchiseItem.create({
            data: { franchiseId, itemId: item.id, addedBy: 'wikidata' },
          });
          totalLinked++;
        } catch { /* already linked */ }
        continue;
      }

      // Fetch related entries from Jikan
      const data = await jikanGet(`/${jikanType}/${item.malId}/relations`);
      apiCalls++;
      await sleep(DELAY_MS);

      if (!data?.data) continue;

      // Find all related malIds in our DB
      const relatedMalIds: number[] = [item.malId!];
      for (const relation of data.data) {
        if (!LINK_RELATION_TYPES.has(relation.relation)) continue;
        for (const entry of relation.entry || []) {
          if (entry.type === jikanType && entry.mal_id) {
            relatedMalIds.push(entry.mal_id);
          }
        }
      }

      // Find which of these are in our DB
      const matchingItems: DbItem[] = [];
      for (const malId of relatedMalIds) {
        const dbItem = byMalId.get(malId);
        if (dbItem) matchingItems.push(dbItem);
      }

      if (matchingItems.length < 2) continue; // Only franchise if we have 2+ entries

      // Find or create a franchise
      // Use the item that's already in a franchise if any, else use this item's title as base
      let franchiseId: number | null = null;
      for (const mi of matchingItems) {
        if (mi.franchiseItems.length > 0) {
          franchiseId = mi.franchiseItems[0].franchiseId;
          break;
        }
      }

      if (!franchiseId) {
        // Create new franchise — use root item title (strip season numbers)
        const baseName = item.title
          .replace(/\s+(Season|Part|Arc|Chapter)\s+\d+.*$/i, '')
          .replace(/\s+\d+$/,'')
          .trim();

        const existing = await prisma.franchise.findFirst({
          where: { name: { equals: baseName, mode: 'insensitive' } },
        });
        if (existing) {
          franchiseId = existing.id;
        } else {
          const created = await prisma.franchise.create({
            data: { name: baseName, autoGenerated: true, confidenceTier: 1, description: '', icon: '', cover: '' },
          });
          franchiseId = created.id;
          newFranchises++;
        }
      }

      // Link all matching items + mark in resolvedGroups
      for (const mi of matchingItems) {
        resolvedGroups.set(mi.malId!, franchiseId);
        if (mi.franchiseItems.length === 0) {
          try {
            await prisma.franchiseItem.create({
              data: { franchiseId, itemId: mi.id, addedBy: 'wikidata' },
            });
            totalLinked++;
          } catch { /* already linked */ }
        }
      }

      if (processed % 100 === 0) {
        console.log(`  Progress: ${processed}/${unlinkedItems.length} (${totalLinked} linked, ${apiCalls} API calls)`);
      }
    }
  }

  // ── Summary
  console.log('\n════════════════════════════════════════════════════');
  console.log('JIKAN PHASE COMPLETE');
  console.log('════════════════════════════════════════════════════');
  console.log(`  API calls made: ${apiCalls}`);
  console.log(`  New links: ${totalLinked}`);
  console.log(`  New franchises: ${newFranchises}`);

  const [total, unlinked] = await Promise.all([
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linkedTotal = total - unlinked;
  console.log(`\n  Items with franchise: ${linkedTotal}/${total} (${((linkedTotal/total)*100).toFixed(1)}%)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
