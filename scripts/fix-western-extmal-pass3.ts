/**
 * Pass 3: Remove ext.mal, malId, and 'Anime' genre from 3 remaining Western animation items
 * that slipped through previous fix passes.
 *
 * Items:
 *   [46]   Spider-Man: Across the Spider-Verse — Western animation (Sony), has Anime genre + ext.mal
 *   [1923] The Lego Batman Movie              — Western animation (WB/DC), has Anime genre + ext.mal
 *   [206]  Zootopia 2                          — Western animation (Disney), has Anime genre + ext.mal
 *
 * Run: npx tsx scripts/fix-western-extmal-pass3.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

const ITEMS_TO_FIX = [
  { id: 46,   title: "Spider-Man: Across the Spider-Verse", reason: "Sony Pictures Animation — Western" },
  { id: 1923, title: "The Lego Batman Movie",              reason: "Warner Bros. Animation — Western" },
  { id: 206,  title: "Zootopia 2",                         reason: "Disney Animation — Western" },
];

async function main() {
  console.log("=== Fix Western Animation Pass 3 ===\n");

  for (const fix of ITEMS_TO_FIX) {
    const item = await prisma.item.findUnique({
      where: { id: fix.id },
      select: { id: true, title: true, genre: true, malId: true, ext: true },
    });
    if (!item) { console.log(`  [${fix.id}] NOT FOUND — skipping`); continue; }

    const ext = (item.ext as Record<string, any>) || {};
    const { mal: _removedMal, ...newExt } = ext;
    const newGenre = (item.genre as string[]).filter(g => g !== "Anime");

    await prisma.item.update({
      where: { id: fix.id },
      data: {
        genre: newGenre,
        malId: null,
        ext: newExt,
      },
    });

    const hadMal = ext.mal !== undefined;
    const hadAnimeGenre = (item.genre as string[]).includes("Anime");
    console.log(`  ✓ [${fix.id}] ${item.title}`);
    console.log(`      Anime genre removed: ${hadAnimeGenre}`);
    console.log(`      ext.mal removed: ${hadMal} (was ${ext.mal ?? "null"})`);
    console.log(`      malId cleared: ${item.malId !== null} (was ${item.malId})`);
    console.log(`      Reason: ${fix.reason}\n`);
  }

  // Final state check
  console.log("=== Final verification ===");
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, title, genre, mal_id, ext
    FROM items
    WHERE id = ANY(ARRAY[46, 1923, 206])
  `;
  for (const r of rows) {
    const ext = r.ext as any;
    const hasAnime = (r.genre as string[])?.includes("Anime");
    const status = (!hasAnime && ext?.mal == null && r.mal_id == null) ? "✓ CLEAN" : "✗ STILL HAS ISSUES";
    console.log(`  ${status} [${r.id}] ${r.title} | Anime genre=${hasAnime} | malId=${r.mal_id} | ext.mal=${ext?.mal ?? "null"}`);
  }

  // Count total items that isAnime() would consider anime
  const animeCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM items
    WHERE type IN ('tv','movie')
      AND parent_item_id IS NULL
      AND (
        'Anime' = ANY(genre)
        OR (ext->>'mal') IS NOT NULL
      )
  `;
  console.log(`\n  Items that pass isAnime() primary check: ${animeCount[0].count}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
