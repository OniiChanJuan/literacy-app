/**
 * Check current state of known Western animation items.
 * Run: npx tsx scripts/check-western-state.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

async function main() {
  // Check specific titles
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id, ext
    FROM items
    WHERE type IN ('tv','movie')
      AND parent_item_id IS NULL
      AND title ILIKE ANY(ARRAY[
        'Rick and Morty','Star Wars Resistance','The Hobbit','The Spectacular Spider-Man',
        'The Lion King','Toy Story','Coco','Bluey','Gravity Falls',
        'Spider-Man: Across the Spider-Verse','The Lego Batman Movie','Zootopia 2'
      ])
    ORDER BY title
  `;
  console.log("=== Specific items to check ===");
  for (const i of rows) {
    const ext = i.ext as any;
    const hasAnimeGenre = (i.genre as string[])?.includes("Anime");
    const extMal = ext?.mal ?? null;
    const flag = (hasAnimeGenre || extMal !== null) ? "  ⚠ NEEDS FIX" : "";
    console.log(`[${i.id}] ${i.title} (${i.type}) | genre=[${(i.genre||[]).join(',')}] | malId=${i.mal_id} | ext.mal=${extMal}${flag}`);
  }

  // Total items still with ext.mal and no Anime genre (tv/movie)
  const withExtMalNoAnime = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id, ext
    FROM items
    WHERE type IN ('tv','movie')
      AND parent_item_id IS NULL
      AND (ext->>'mal') IS NOT NULL
      AND NOT ('Anime' = ANY(genre))
    ORDER BY title
  `;
  console.log(`\n=== All tv/movie items with ext.mal but NO 'Anime' genre: ${withExtMalNoAnime.length} ===`);
  for (const i of withExtMalNoAnime) {
    const ext = i.ext as any;
    console.log(`  [${i.id}] ${i.title} (${i.type}) | malId=${i.mal_id} | ext.mal=${ext?.mal}`);
  }

  // Items with 'Anime' genre that match western patterns
  const westernInAnime = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id, ext
    FROM items
    WHERE type IN ('tv','movie')
      AND parent_item_id IS NULL
      AND 'Anime' = ANY(genre)
      AND (
        title ILIKE '%rick and morty%'
        OR title ILIKE '%star wars resistance%'
        OR title ILIKE '%the hobbit%'
        OR title ILIKE '%spectacular spider-man%'
        OR title ILIKE '%spider-man: across%'
        OR title ILIKE '%lego batman%'
        OR title ILIKE '%zootopia%'
      )
    ORDER BY title
  `;
  console.log(`\n=== Western animation items that still have 'Anime' genre: ${westernInAnime.length} ===`);
  for (const i of westernInAnime) {
    const ext = i.ext as any;
    console.log(`  [${i.id}] ${i.title} (${i.type}) | malId=${i.mal_id} | ext.mal=${ext?.mal ?? 'null'}`);
  }

  // malId=59907 check
  const owl = await prisma.item.findMany({
    where: { malId: 59907 },
    select: { id: true, title: true, type: true, malId: true, genre: true },
  });
  console.log(`\n=== Items with malId=59907: ${owl.length} ===`);
  for (const i of owl) console.log(`  [${i.id}] ${i.title} (${i.type})`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
