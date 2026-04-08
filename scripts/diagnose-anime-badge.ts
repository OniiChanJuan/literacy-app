import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Check specific anime items
  const titles = ["Attack on Titan", "Death Note", "Naruto", "Fullmetal Alchemist", "One Piece", "Dragon Ball Z"];

  for (const title of titles) {
    const item = await prisma.item.findFirst({
      where: { title: { contains: title, mode: "insensitive" }, parentItemId: null, type: { in: ["tv", "anime"] } },
      select: {
        id: true, title: true, type: true, genre: true, malId: true, tmdbId: true,
        // Check for originCountry if it exists - we'll use $queryRaw for full record
      }
    });
    if (item) {
      console.log(`\n=== ${item.title} ===`);
      console.log(`  id: ${item.id}`);
      console.log(`  type: ${item.type}`);
      console.log(`  genre: ${JSON.stringify(item.genre)}`);
      console.log(`  malId: ${item.malId}`);
      console.log(`  tmdbId: ${item.tmdbId}`);
    } else {
      console.log(`\n=== ${title}: NOT FOUND ===`);
    }
  }

  // Get raw record for Attack on Titan — known-good columns only
  const aot = await prisma.$queryRaw`
    SELECT id, title, type, genre, mal_id, tmdb_id, ext, vibes, year, vote_count, slug
    FROM items
    WHERE title ILIKE '%Attack on Titan%' AND parent_item_id IS NULL AND type IN ('tv', 'anime')
    LIMIT 3
  `;
  console.log("\n=== ATTACK ON TITAN FULL RECORD ===");
  console.log(JSON.stringify(aot, null, 2));

  // Count: how many have mal_id set
  const withMal = await prisma.item.count({ where: { malId: { not: null }, type: "tv" } });
  const withoutMal = await prisma.item.count({ where: { malId: null, type: "anime" } });
  console.log(`\n=== COUNTS ===`);
  console.log(`TV items with mal_id set: ${withMal}`);
  console.log(`Anime-type items without mal_id: ${withoutMal}`);

  // Count tv items that have 'Anime' in genre
  const withAnimeGenre = await prisma.item.count({ where: { type: "tv", genre: { has: "Anime" } } });
  const withAnimationGenre = await prisma.item.count({ where: { type: "tv", genre: { has: "Animation" } } });
  console.log(`TV items with genre 'Anime': ${withAnimeGenre}`);
  console.log(`TV items with genre 'Animation': ${withAnimationGenre}`);

  // Show items that DO pass anime detection — type=anime
  const animeType = await prisma.item.findMany({
    where: { type: "anime", parentItemId: null },
    select: { id: true, title: true, genre: true, malId: true, tmdbId: true },
    take: 5,
  });
  console.log("\n=== ITEMS WITH type='anime' (first 5 — these get badge) ===");
  animeType.forEach(i => console.log(`  [${i.id}] ${i.title} | malId:${i.malId} | tmdbId:${i.tmdbId} | genre:${JSON.stringify(i.genre)}`));

  // Show tv items that might be anime (have 'Anime' genre or Animation + JP origin or mal_id)
  const suspectedAnime = await prisma.$queryRaw`
    SELECT id, title, type, genre, mal_id, tmdb_id
    FROM items
    WHERE type = 'tv'
    AND parent_item_id IS NULL
    AND (
      genre @> ARRAY['Anime']::text[] OR
      (genre @> ARRAY['Animation']::text[]) OR
      mal_id IS NOT NULL
    )
    LIMIT 20
  `;
  console.log("\n=== TV ITEMS that might be anime (genre=Anime/Animation or has mal_id) ===");
  (suspectedAnime as any[]).forEach(i => console.log(`  [${i.id}] ${i.title} | type:${i.type} | genre:${JSON.stringify(i.genre)} | malId:${i.mal_id}`));

  // Check if origin_country column even exists
  const colCheck = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'items' AND column_name IN ('source', 'mal_id', 'ext', 'item_subtype')
  `;
  console.log("\n=== COLUMN CHECK (origin_country, source, mal_id) ===");
  console.log(JSON.stringify(colCheck));
}

main().catch(console.error).finally(() => prisma.$disconnect());
